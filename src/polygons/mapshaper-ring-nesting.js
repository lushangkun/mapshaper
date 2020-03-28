/* @requires mapshaper-shape-utils, mapshaper-path-index */

// Delete rings that are nested directly inside an enclosing ring with the same winding direction
// Does not remove unenclosed CCW rings (currently this causes problems when
//   rounding coordinates for SVG and TopoJSON output)
// Assumes ring boundaries do not overlap (should be true after e.g. dissolving)
//
internal.fixNestingErrors = function(rings, arcs) {
  if (rings.length <= 1) return rings;
  var ringData = internal.getPathMetadata(rings, arcs, 'polygon');
  // convert rings to shapes for PathIndex
  var shapes = rings.map(function(ids) {return [ids];});
  var index = new PathIndex(shapes, arcs);
  return rings.filter(ringIsValid);

  function ringIsValid(ids, i) {
    var containerId = index.findSmallestEnclosingPolygon(ids);
    var ringIsCW, containerIsCW;
    var valid = true;
    if (containerId > -1) {
      ringIsCW = ringData[i].area > 0;
      containerIsCW = ringData[containerId].area > 0;
      if (containerIsCW == ringIsCW) {
        // reject rings with same chirality as their containing ring
        valid = false;
      }
    }
    return valid;
  }
};

// Set winding order of polygon rings so that outer rings are CW, first-order
// nested rings are CCW, etc.
internal.rewindPolygons = function(lyr, arcs) {
  lyr.shapes = lyr.shapes.map(function(shp) {
    if (!shp) return null;
    return internal.rewindPolygon(shp, arcs);
  });
};

// Update winding order of rings in a polygon so that outermost rings are
// CW and nested rings alternate between CCW and CW.
internal.rewindPolygon = function(rings, arcs) {
  var ringData = internal.getPathMetadata(rings, arcs, 'polygon');

  // Sort rings by area, from large to small
  ringData.sort(function(a, b) {
    return Math.abs(b.area) - Math.abs(a.area);
  });
  // If a ring is contained by one or more rings, set it to the opposite
  //   direction as its immediate parent
  // If a ring is not contained, make it CW.
  ringData.forEach(function(ring, i) {
    var shouldBeCW = true;
    var j = i;
    var largerRing;
    while (--j >= 0) {
      largerRing = ringData[j];
      if (internal.testRingInRing(ring, largerRing, arcs)) {
        // set to opposite of containing ring
        shouldBeCW = largerRing.area > 0 ? false : true;
        break;
      }
    }
    internal.setRingWinding(ring, shouldBeCW);
  });
  return ringData.map(function(data) { return data.ids; });
};

// data: a ring data object
internal.setRingWinding = function(data, cw) {
  var isCW = data.area > 0;
  if (isCW != cw) {
    data.area = -data.area;
    internal.reversePath(data.ids);
  }
};

// a, b: two ring data objects (from getPathMetadata);
internal.testRingInRing = function(a, b, arcs) {
  if (b.bounds.contains(a.bounds) === false) return false;
  var p = arcs.getVertex(a.ids[0], 0); // test with first point in the ring
  return geom.testPointInRing(p.x, p.y, b.ids, arcs) == 1;
};

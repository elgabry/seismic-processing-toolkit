# Geometry and coordinate QC

`GeometryBuilder` reads standard SEG-Y trace headers through public APIs and retains raw X/Y values, scalars, unit codes, scaled source/receiver coordinates, elevations, CMP IDs, and header offsets in typed-array columns. Scalar handling follows SEG-Y: positive multiplies, negative divides by magnitude, and zero is identity.

The map is offline Canvas 2D. It does not fetch basemap tiles, upload files, assume metres, or reproject coordinates. It is useful for local survey grids and explicitly labels the coordinate-only view. Controls include fit/reset, pan, wheel zoom, box zoom, box selection, Shift-additive selection, source/receiver/CMP layers, point size, role/offset/ID colour choices, QC-severity filtering, hover inspection, and PNG export. World/screen transforms, extent fitting, box conversion, cursor zoom, pan, and grid-backed hit testing are separate testable modules.

Coordinate QC reports structured findings for missing/zero coordinates, unknown or mixed units/scalars, duplicate positions, conflicting IDs, source-receiver coincidence, missing elevations, offset disagreement, coordinate jumps, degenerate extents, and offset outliers. Meter-specific offset/jump checks run only when headers declare length units; unknown units yield an uncertainty warning instead.

The grid is built once from finite points and is used for hover, click, and box candidates. Pointer gestures compare pointer-up position with the original pointer-down coordinate, so a pan release cannot be misclassified as a point click. The map labels unit/scalar values but cannot infer a coordinate reference system.

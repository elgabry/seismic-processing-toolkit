# Geometry and coordinate QC

`GeometryBuilder` reads standard SEG-Y trace headers through public APIs and retains raw X/Y values, scalars, unit codes, scaled source/receiver coordinates, elevations, CMP IDs, and header offsets in typed-array columns. Scalar handling follows SEG-Y: positive multiplies, negative divides by magnitude, and zero is identity.

The map is offline Canvas 2D. It does not fetch basemap tiles, upload files, assume metres, or reproject coordinates. It is useful for local survey grids and explicitly labels the coordinate-only view. World/screen transforms, extent fitting, cursor zoom, pan, and grid-backed hit testing are separate testable modules.

Coordinate QC reports structured findings for missing/zero coordinates, unknown or mixed units/scalars, duplicate positions, conflicting IDs, source-receiver coincidence, missing elevations, offset disagreement, coordinate jumps, degenerate extents, and offset outliers. Meter-specific offset/jump checks run only when headers declare length units; unknown units yield an uncertainty warning instead.

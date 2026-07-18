# SmartSolo SEG-D 8058 support

The modular reader supports only the SmartSolo layout already handled by the preserved v2.2 converter: format signature `0x8058`, big-endian IEEE Float32 demultiplexed traces, and declared revisions **1.0** and **2.1**. Gather types SG, RG, and CG are retained. This is not a general SEG-D reader.

The reader uses bounded random-access reads. It parses the general, channel-set/skew, extended, and external header regions required by the legacy mapping, then scans 244-byte trace headers in 64 KiB windows. Samples remain in the source until a trace is decoded or converted.

Known mapping: FFID, trace/channel number, source point, centimetre coordinates, elevations, receiver serial, sample count/interval, gather type, and documented GPS fields map into SEG-Y revision 1 defaults (IEEE Float32, big endian). RG source/receiver fields are swapped back to standard SEG-Y semantics. Automatic coordinate scalar `-100` displays centimetres as metres.

All read header bytes are preserved in the reader. With **preserve raw metadata** enabled, the bounded raw header prefix is written as extended textual-header hexadecimal provenance. Undocumented vendor fields, trace classes, and unsupported encodings are not inferred; they produce structured diagnostics or errors.

Conversion is deterministic for identical input/options and streams one decoded trace through `SegyWriter` at a time. Browser Blob output is limited by the existing sink safety limit; use a streaming sink where available for large exports.

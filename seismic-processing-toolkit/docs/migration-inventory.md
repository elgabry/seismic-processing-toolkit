# Migration inventory

| Existing feature | Existing function/code region | Target module | Migration status | Test coverage | Intentional change |
|---|---|---|---|---|---|
| SEG-Y parse / endian / text | `parseFile`, `detectText`, `decodeText` | `io/segy/SegyReader`, headers | implemented; dependency-gate verification pending | reader/codec tests | implausible headers warn instead of assuming IEEE |
| Sample formats / IBM | `sampleReader`, `ibmToFloat` | `io/segy/codecs` | implemented; dependency-gate verification pending | codec tests | format 4 rejects explicitly |
| In-memory trace cache | `getTrace` | `SegyTraceAccessor` | implemented/improved; dependency-gate verification pending | reader integration | byte LRU and Blob slicing |
| Header browser | `renderText`, `renderBin`, `renderTrc` | `ui`, headers | baseline modular UI; compatibility adapter for remaining behavior | reader tests; browser smoke pending | modular UI shows standard schema |
| Wiggle / VA / density | `draw`, `drawVD` | `visualization/WiggleRenderer` | baseline modular UI; compatibility adapter for gestures | renderer preparation manual; browser smoke pending | legacy remains adapter for full gestures |
| Map / coordinates | `coordSet`, `drawMap`, `utm2ll` | legacy adapter / gathers | compatibility adapter | legacy reference | modular map pending UI surface |
| AGC/gain | `getDisplayTrace`, `normFactor` | `processing/gain` | implemented; dependency-gate verification pending | `processing.test.ts` | seconds in public API |
| Gather sorting | `buildVis`, `gKeyOf` | `processing/gathers` | implemented API; modular UI pending | index-level API smoke coverage pending | supports CMP/custom key |
| Sweep / resample / correlation | `sweep`, `resampleTo`, `correlate` | `sweep`, `processing/vibroseis`, workers | implemented; browser-worker verification pending | correlation tests | documented same-lag convention |
| SmartSolo SEG-D 8058 | `convertSegd` | `legacy/reference` | compatibility adapter | legacy reference | dedicated streaming converter pending |
| SEG-Y/PNG/CSV export | `writeSegy`, `dl` | `SegyWriter`, sink | SEG-Y implemented; PNG/CSV compatibility adapter | writer tests; browser export smoke pending | streaming output replaces monolithic buffer |
| Keyboard/mouse zoom | interaction region | `visualization` + legacy adapter | compatibility adapter | manual | preserve in v2.2 page while modular gesture controller expands |

# Algorithm conventions

- DSP sample intervals are seconds. SEG-Y I/O values stay raw microseconds/milliseconds until conversion at the boundary.
- Correlation is `r_xs[l] = Σ x[n+l]s[n]`. Full index `k` has lag `k-(M-1)`. `same` returns lags `0..N-1`; a delayed sweep peaks at its delay sample. Correlation equals convolution with the time-reversed sweep.
- FFT forward transforms are unnormalised and inverse transforms divide by N.
- Convolution full output uses ordinary causal index `k=i+j`; same is kernel-centred, valid contains only complete kernel overlap.
- Positive SEG-Y coordinate/elevation scalar multiplies; negative divides by magnitude; zero is one. Raw values are never overwritten by scaled values.
- Trace polarity is preserved unless a specific processing step reverses it.
- Delay recording time is a trace-header millisecond value and is not silently added to sample arrays.
- AGC uses centred, truncated edge windows. Resampling preserves time zero and applies a windowed-sinc low-pass interpolation kernel with cutoff `0.5 * min(1, sourceDt / targetDt)` cycles per source sample before decimation.
- Offset preserves header and coordinate-derived values. CMP uses scaled coordinate midpoint but warns when units are not length units.
- Non-finite input samples are replaced with zero by correlation while their count is reported in `CorrelationResult`.
- Spiking deconvolution uses a causal prediction-error filter with zero prediction distance. Predictive deconvolution takes a positive prediction distance in samples; its Toeplitz design solves for the future autocorrelation lags and applies the causal FIR from trace sample zero. UI code must convert milliseconds to samples exactly once before calling the DSP API.

# The food-web model

A mean-field model of Tidemote's food web, fitted to GPU ensembles, used to try changes in seconds before
spending GPU hours on them (docs/ecosystem.md has the results). Python lives in `.venv` (numpy, scipy):
`python3 -m venv tools/ecomodel/.venv && tools/ecomodel/.venv/bin/pip install numpy scipy`.

1. `node tools/ecomodel/responses.mjs runs/A runs/B ... --json tools/ecomodel/meas/points.json`: every
   run's 5-minute windows (awake densities, per-cell incomes, costs, births and deaths, kills, growth).
   The windows are not tracked (26 MB; commit 619e639 has the study's). They come back exactly (but for
   trait columns the older files lacked) from its ensembles under `runs/`, run from the repository's root:
   `points.json` from feE2b rBb2dL rBb2L lgD60 feE2 rBb2d rBb2 rBb15 rB rAb15 s10base iaA6 iaA6b iaA60
   trD30 b3 b25 b3ia b25b b25L b4L pr25L defL2 fl5L fl5 flsatL flsatabL, in that order;
   `points_extra.json` from nd2L sa13L sa2L ndts3L; `traits.json` (evo.py) from trD30 b3 b25 b3ia b25b
   b25L b4L pr25L defL2 fl5L flsatL flsatabL nd2L sa13L sa2L ndts3L ts3L iaA6b iaA60.
2. `.venv/bin/python tools/ecomodel/fit.py`: fits the processes (light per producer, grazing, hunters'
   kills, scavenging, births against surplus, deaths by being eaten) to the windows -> `meas/fit.json`.
   Tag new ensembles' rules in `RULES` there.
3. `.venv/bin/python tools/ecomodel/trajfit.py --hold A,B`: fits a few parameters so the model, started
   from each ensemble's 7-minute state, follows its median trajectory; held-out sets test prediction ->
   `meas/model.json`.
4. `.venv/bin/python tools/ecomodel/sweep.py`: knobs through the fitted model, ranked by the smallest
   animal guild at 30 and 60 minutes. Test the best on the GPU, add the ensemble, refit.

`web.py` is the model; `terms.py` and `residuals.py` check its processes at measured states;
`decomp.mjs` the routing x cost identity behind guild sizes; `measure.mjs` one ensemble window's state;
`model.py` the first, hand-calibrated version (rule A against rule B, stability by eigenvalues).
Beyond it: `web2.py` (animals as histograms over their energy) and `validate.py` (both against measured
windows), `web3.py` (patches in space, its parameters fitted by `fit3.py`), `web4.py` (species within
guilds, unfitted) and `evo.py` (swim and lifespan by adaptive dynamics, from `traits.json`).

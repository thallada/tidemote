# The food-web model

A mean-field model of Tidemote's food web, fitted to GPU ensembles, used to try changes in seconds before
spending GPU hours on them (docs/ecosystem.md has the results). Python lives in `.venv` (numpy, scipy):
`python3 -m venv tools/ecomodel/.venv && tools/ecomodel/.venv/bin/pip install numpy scipy`.

1. `node tools/ecomodel/responses.mjs runs/A runs/B ... --json tools/ecomodel/meas/points.json`: every
   run's 5-minute windows (awake densities, per-cell incomes, costs, births and deaths, kills, growth).
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

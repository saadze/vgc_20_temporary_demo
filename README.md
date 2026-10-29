# DRAKEN dashboard

This is a **formatting-only** reorganization of the uploaded v0.6 dashboard.
All simulated strategy assumptions and demonstration calculations are unchanged.

## Files

- `index.html` — page structure, labels and controls. Open this file in a browser.
- `styles.css` — colors, layout, responsive rules and chart styles.
- `dashboard.js` — simulation, stochastic futures, scenario pathways and charts.

Keep these three files **in the same folder** so the relative `href` and `src` links work. No external frameworks or internet connection are required.

## Editing guide

- **Text or input markup:** edit `index.html`.
- **Colors or spacing:** edit the CSS variables at the start of `styles.css`.
- **Demonstration strategy coefficients:** edit `STRATEGIES` in `dashboard.js`.
- **Stochastic scenario generation:** edit `futureWorld()` in `dashboard.js`.
- **Review-gate decision rules:** edit `actionFor()` in `dashboard.js`.
- **Yearly simulation outcomes:** edit `runPath()` in `dashboard.js`.
- **Charts and tables:** edit the `render…()` / `svg…()` functions.

**Model status:** all numerical parameters remain illustrative, not Saab forecasts.

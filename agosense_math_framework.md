# A Mathematical Framework for Agosense
**IoT-Based, Machine-Learning-Integrated Multi-Parameter Water Quality Monitoring and WAWQI Assessment of the Digos River, Davao del Sur**  
*Prepared from a mathematical-biology perspective — September 24, 2026*

---

## Overview

The study has four mathematical components:
1. A sensor measurement model that answers research question 1 (accuracy against laboratory references);
2. The Weighted Arithmetic Water Quality Index (WAWQI) as the core computation;
3. Uncertainty, sensitivity, and site/time characterization that answer research question 2 (conditions over the 14-day period); and
4. A machine-learning layer with a well-defined mathematical role. An optional mechanistic extension (river transport) is given in Section 5.

Throughout:
- $p \in \{\text{pH}, T, \text{Turb}, \text{TDS}\}$ indexes parameters
- $s$ indexes sites
- $t$ indexes time

---

## 1. Measurement Model (Research Question 1)

Let $x$ be the laboratory reference value and $y$ the Agosense reading:
$$y_{p,k} = \alpha_p + \beta_p x_{p,k} + \varepsilon_{p,k}, \quad \varepsilon_{p,k} \sim \mathcal{N}(0, \sigma_p^2) \tag{1}$$

### Calibration
Estimate $(\alpha_p, \beta_p)$ by least squares and correct readings using:
$$\hat{x} = \frac{y - \hat{\alpha}_p}{\hat{\beta}_p}$$
Perfect accuracy corresponds to $\alpha_p = 0$, $\beta_p = 1$, which can be tested jointly with an $F$-test.

### Parameter-Specific Notes
- **Turbidity**: Frequently nonlinear in raw sensor voltage. Fit a low-degree polynomial or a power law $y = a x^b$ (linear after taking logarithms).
- **TDS**: Inferred from conductivity: $\text{TDS} = k \cdot EC_{25}$ with $k \approx 0.5\text{--}0.7$, where temperature compensation is:
  $$EC_{25} = \frac{EC_T}{1 + 0.02(T - 25)} \tag{2}$$
  Hence TDS accuracy depends on temperature-sensor accuracy; report this coupling.

### Accuracy Metrics (per parameter)
$$\text{MAE} = \frac{1}{n}\sum_{k} |y_k - x_k|$$
$$\text{RMSE} = \sqrt{\frac{1}{n}\sum_{k} (y_k - x_k)^2}$$
$$\text{MAPE} = \frac{100}{n}\sum_{k} \left|\frac{y_k - x_k}{x_k}\right| \tag{3}$$

Also report $R^2$; Lin's concordance correlation coefficient:
$$\rho_c = \frac{2 s_{xy}}{s_x^2 + s_y^2 + (\bar{x} - \bar{y})^2} \tag{4}$$
and a Bland–Altman analysis (bias $\bar{d} \pm 1.96 s_d$ limits of agreement, $d_k = y_k - x_k$). Use a paired $t$-test, or Wilcoxon signed-rank test when differences are non-normal, to test systematic bias.

### Noise Filtering
Before any computation, apply a rolling median for spike rejection, then an EWMA or Kalman-type update:
$$\hat{x}_t = \hat{x}_{t-1} + K_t (y_t - \hat{x}_{t-1}) \tag{5}$$

### Sample Size
Aim for at least 30 paired sensor–laboratory readings per parameter for stable Bland–Altman limits and regression estimates.

---

## 2. The WAWQI Model

### Quality Rating
For parameter $i$ with measured value $V_i$, standard $S_i$, and ideal value $V_{0,i}$:
$$Q_i = 100 \frac{V_i - V_{0,i}}{S_i - V_{0,i}} \tag{6}$$

- For **pH**: use $V_0 = 7$ and $|V_i - 7|$ in the numerator, so acidic and basic deviations both increase $Q$.
- For **TDS and Turbidity**: $V_0 = 0$.
- **Temperature**: Requires a stated, justified reference (for example the site's ambient baseline, or the allowable-rise criterion under DAO 2016-08); this choice must appear in the methods.

### Unit Weights
$$W_i = \frac{K}{S_i}, \quad K = \left(\sum_{i=1}^{4} \frac{1}{S_i}\right)^{-1}, \quad \sum_{i} W_i = 1 \tag{7}$$

### Index
$$\text{WAWQI} = \frac{\sum_i Q_i W_i}{\sum_i W_i} = \sum_{i=1}^{4} Q_i W_i \tag{8}$$

### Classification (Brown / Chatterjee–Raziuddin scale)

| Class | WAWQI Range |
| :--- | :--- |
| **Excellent** | 0 – 25 |
| **Good** | 26 – 50 |
| **Poor** | 51 – 75 |
| **Very poor** | 76 – 100 |
| **Unfit for drinking** | > 100 |

*Note.* Verify all $S_i$ against the DAO 2016-08 water body class assigned to the river segment (and WHO/PNSDW values where drinking use is discussed). Because $W_i \propto 1/S_i$, the standards drive the weights and therefore the index.

### 2.1 Worked Example (Illustrative numbers, not measured data)
Take $\text{pH} = 7.6$, $T = 28^\circ\text{C}$, $\text{turbidity} = 8\text{ NTU}$, $\text{TDS} = 180\text{ mg/L}$, with standards $S = 8.5\text{ (pH)}$, $30\text{ (temperature, ideal } 25^\circ\text{C)}$, $5\text{ NTU}$, and $500\text{ mg/L}$.  
Then $K = (1/8.5 + 1/30 + 1/5 + 1/500)^{-1} \approx 2.833$.

| Parameter | $Q_i$ | $W_i$ | $Q_i W_i$ |
| :--- | :--- | :--- | :--- |
| pH | 40 | 0.333 | 13.3 |
| Temperature | 60 | 0.094 | 5.7 |
| Turbidity | 160 | 0.567 | 90.7 |
| TDS | 36 | 0.006 | 0.2 |
| **WAWQI** | | | $\approx \mathbf{109.9}$ **(unfit)** |

*Turbidity contributes over 80% of the score. This is a structural property of WAWQI: the parameter with the tightest standard receives the largest weight and dominates. It should be discussed openly as a limitation and interpreted with care.*

---

## 3. Uncertainty and Sensitivity Analysis

Sensor error propagates into the index. Differentiating:
$$\frac{\partial\,\text{WAWQI}}{\partial V_i} = \frac{100 W_i}{S_i - V_{0,i}} \tag{9}$$

So by the delta method:
$$\operatorname{Var}(\text{WAWQI}) \approx \sum_{i} \left(\frac{100 W_i}{S_i - V_{0,i}}\right)^2 \sigma_i^2 \tag{10}$$

with $\sigma_i$ taken from the RQ1 residual standard deviation. In the worked example, the turbidity sensitivity is about 11.3 index points per NTU, so a small turbidity error can change the class.

### Monte Carlo Class Probabilities
Draw $V_i^{(m)} \sim \mathcal{N}(\hat{V}_i, \sigma_i^2)$ for $m = 1, \dots, 10{,}000$, compute $\text{WAWQI}^{(m)}$, and report:
$$P(\text{class} = c) \approx \frac{1}{M}\sum_{m=1}^{M} \mathbf{1}\{\text{WAWQI}^{(m)} \in c\} \tag{11}$$
rather than a single hard label. Complement this with a one-at-a-time or Sobol sensitivity analysis on both the measurements and the choice of $S_i$.

---

## 4. Site and Temporal Characterization (Research Question 2)

- **Descriptives per site and parameter over the 14 days**: mean, SD, coefficient of variation, range, and daily aggregates.
- **Site differences**: one-way ANOVA or Kruskal–Wallis, with Tukey or Dunn post hoc tests. To respect repeated measures, use a mixed model:
  $$\text{WAWQI}_{s,t} = \mu + a_s + \gamma\,\text{rain}_t + u_t + \epsilon_{s,t} \tag{12}$$
  where $a_s$ is the site effect and $u_t$ an AR(1) temporal process.
- **Compliance**: the exceedance fraction $P(V_i > S_i)$ for each parameter and site.
- **Temporal structure**: the autocorrelation function, and a diurnal harmonic fit:
  $$V(t) = c_0 + A \cos\left(\frac{2\pi t}{24} - \phi\right) \tag{13}$$
  for temperature and turbidity.

---

## 5. Optional Extension: River Transport Model

With two or three ordered sites, a one-dimensional advection–diffusion–reaction equation links them mechanistically:
$$\frac{\partial C}{\partial t} + u \frac{\partial C}{\partial x} = D \frac{\partial^2 C}{\partial x^2} - k(T) C + S(x, t), \quad k(T) = k_{20} \theta^{T-20} \tag{14}$$

The Arrhenius-type factor $\theta^{T-20}$ ($\theta \approx 1.02\text{--}1.05$) is the standard temperature correction for biochemical rates. At steady state with negligible diffusion and no local source:
$$C(x) = C_0 e^{-kx/u} \tag{15}$$
so $k$ can be estimated from site-to-site declines, and sections where $S(x)$ is needed to explain observed increases point to inputs such as agricultural runoff or urban discharge. With only four parameters and no dissolved oxygen or BOD, treat this as a discussion-level extension unless flow-velocity data are available.

---

## 6. Machine-Learning Layer

WAWQI is a deterministic function of the four readings, so predicting WAWQI class from the same four inputs is nearly trivial and proves little. To keep the ML component mathematically meaningful, assign it tasks the formula cannot perform:

1. **Forecasting**: predict $\text{WAWQI}_{t+h}$ from lagged readings (random forest, gradient boosting, or an LSTM if data permit). Validate with a rolling-origin time-series split, not random $k$-fold.
2. **Sensor drift and error correction**: learn $x = f(y, T)$ against laboratory values (regularized regression or support vector regression).
3. **Anomaly detection**: flag pollution events using the Mahalanobis distance:
   $$D^2 = (\mathbf{v} - \boldsymbol{\mu})^\top \mathbf{\Sigma}^{-1} (\mathbf{v} - \boldsymbol{\mu}) \tag{16}$$
   or an EWMA control chart.

Report RMSE and MAE for regression tasks, and the confusion matrix, macro-F1, and Cohen's $\kappa$ for class prediction. With only 14 days of data, favor simple models and state this limitation explicitly.

---

## 7. Suggested Methods Pipeline

1. Collect paired sensor and laboratory readings (at least 30 pairs per parameter).
2. Filter the data, calibrate, and compute the RQ1 accuracy metrics.
3. Compute $Q_i$, $W_i$, and WAWQI for each site and time point.
4. Propagate uncertainty (delta method and Monte Carlo) and report class probabilities.
5. Run the site and temporal analyses for RQ2.
6. Fit the ML task(s) and validate with time-aware splits.

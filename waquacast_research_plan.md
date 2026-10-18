# RESEARCH PLAN

**Institution**: Cor Jesu College, Inc.  
*Sacred Heart Avenue, Digos City, Province of Davao del Sur, 8002 Philippines*  
*Autonomous School • ISO 21001:2018 Certified • PAASCU Accredited*

---

### Title
**WaQuaCast: Development of an IoT-Based Machine Learning-Integrated Multi-Parameter Water Quality Monitoring and Forecasting System for the Balutakay River, Davao del Sur**

### Proponents
- Ethan Rodel Alviola
- Kent Cyrelle Cahatian
- John Marc Candones
- Kenneth Carl L. Fano
- Lemuel Adrian Ferrariz
- Christian Kiel D. Galez
- Jim Izy Grafani
- Prince Genery Reyes

### Proposed Start and End Date
**July 2026 – October 2026**

---

## A. Rationale

Water quality is essential for maintaining public health, agricultural activities, and aquatic ecosystems. However, rivers such as the Balutakay River in Davao del Sur may experience changes in water quality due to agricultural runoff, weather conditions, and human activities. Conventional water-quality monitoring commonly relies on periodic water sampling and laboratory analysis, which can be time-consuming and may not provide immediate information about changes in water conditions. 

To address these challenges, this study aims to develop an IoT-based machine learning-integrated multi-parameter water-quality monitoring and forecasting system for the Balutakay River. The system will automatically collect measurements of pH, temperature, turbidity, and Total Dissolved Solids (TDS) and use the Weighted Arithmetic Water Quality Index (WAWQI) to assess and classify overall water quality. It will also use Random Forest Regression to analyze historical measurements and forecast future values of the selected parameters. 

Through the integration of IoT and machine learning, the study aims to provide a practical and data-driven approach that can support timely monitoring and assessment of changes in the water quality of the Balutakay River.

---

## B. Research Questions

1. **How accurately can the developed system measure the selected water-quality parameters compared with reference measurements?**
   - 1.1. pH;
   - 1.2. Temperature;
   - 1.3. Turbidity; and
   - 1.4. Total Dissolved Solids (TDS)?

2. **What is the water-quality condition of the selected monitoring sites based on the Weighted Arithmetic Water Quality Index (WAWQI)?**
   - 2.1. Upstream site;
   - 2.2. Midstream site; and
   - 2.3. Downstream site?

3. **How accurately can the Random Forest Regression model forecast the future values of the selected water-quality parameters using historical sensor data?**
   - 3.1. pH;
   - 3.2. Temperature;
   - 3.3. Turbidity; and
   - 3.4. Total Dissolved Solids (TDS)?

4. **Is there a significant difference between the actual and forecasted values of the selected water-quality parameters?**

5. **Which among the selected water-quality parameters can be forecasted most accurately by the Random Forest Regression model?**

---

## C. Goals and Expected Outcomes

1. To develop an IoT-based machine-learning water-quality monitoring system capable of measuring and forecasting pH, temperature, turbidity, and total dissolved solids (TDS) in selected sites along the Balutakay River, Davao del Sur.
2. To determine the accuracy of the developed system in measuring the selected water-quality parameters, namely pH, temperature, turbidity, and TDS.
3. To assess and classify the overall water quality of the selected monitoring sites using the Weighted Arithmetic Water Quality Index (WAWQI) based on the measured pH, temperature, turbidity, and TDS values and applicable DENR water-quality standards.
4. To evaluate the accuracy of the machine-learning model in forecasting the future values of pH, temperature, turbidity, and TDS using historical water-quality data.
5. To determine which of the four water-quality parameters can be forecasted most accurately by the developed machine-learning model.

---

## D. Hypotheses

- **1.1 Null Hypothesis**: The machine-learning model cannot accurately forecast the future values of pH, temperature, turbidity, and total dissolved solids (TDS) based on historical water-quality data collected.
- **1.2 Null Hypothesis**: The developed IoT-based monitoring system cannot accurately output a scale-based water-quality classification using the Weighted Arithmetic Water Quality Index (WAWQI) and DENR DAO 2016-08 standards compared with established reference classifications.
- **2.1 Alternative Hypothesis**: The machine-learning model can accurately forecast the future values of pH, temperature, turbidity, and total dissolved solids (TDS) based on historical water-quality data collected.
- **2.2 Alternative Hypothesis**: The developed IoT-based monitoring system can accurately output a scale-based water-quality classification using the Weighted Arithmetic Water Quality Index (WAWQI) and DENR DAO 2016-08 standards compared with established reference classifications.

---

## E. Description in Details and Methods or Procedure

### Phase I: System Design and Development
The researchers will design and develop an IoT-based machine learning-integrated multi-parameter water-quality monitoring and forecasting system for selected sites along the Balutakay River, Davao del Sur. 

- **Hardware Architecture**: The system will consist of pH, temperature, turbidity, and TDS sensors connected to an ESP32, Raspberry Pi, display, power supply, and other necessary electronic components.
  - **ESP32**: Collects and transmits the sensor measurements.
  - **Raspberry Pi**: Receives, stores, and processes the collected data.
- **Data Logging**: Programmed to automatically record measurements at predetermined time intervals for historical water-quality dataset development (Abrajano et al., 2024; Krklješ et al., 2024).
- **Calibration & Preliminary Testing**: Calibrated using appropriate standard solutions or reference instruments prior to deployment. Systematic testing of sensors, data processing, storage, and communication between ESP32 and Raspberry Pi (U.S. EPA, 2009).

### Phase II: Field Deployment and Data Collection
Water-quality measurements will be collected from three selected monitoring sites along the Balutakay River, Davao del Sur:
1. **Upstream Site**: Relatively less disturbed section serving as a baseline reference.
2. **Midstream Site**: Located in an area influenced by nearby communities, agricultural activities, or human activities.
3. **Downstream Site**: Located farther along the river, downstream of potential anthropogenic and environmental influences, assessing accumulated changes in water quality.

- **Deployment Procedure**: Immersion of sensors to required operating conditions with stabilization before logging. Measurements logged with date, time, and site identifier.
- **Sensor Accuracy Validation**: Paired comparison against calibrated reference instruments and laboratory testing of sampled water (U.S. EPA, 2009).

### Phase III: Water Quality Assessment (WAWQI)
Collected measurements of pH, temperature, turbidity, and TDS will be referenced against Department of Environment and Natural Resources (DENR) standards, specifically **DAO 2016-08**.
- WAWQI calculation assigns quality ratings ($Q_i$) and weights ($W_i$) based on established methodology (Brown et al., 1970).
- Numerical index translates to water-quality classification for each monitoring period and site.

### Phase IV: Machine Learning Development (Random Forest Regression)
- Historical sensor dataset will be preprocessed (cleaning, imputation/handling of missing/abnormal values).
- **Algorithm**: Random Forest Regression (Breiman, 2001) combining multiple decision trees.
- **Train/Test Splitting**: Strictly chronological split to prevent lookahead / future information leakage (Hyndman & Athanasopoulos, 2021).
- Generates forecasts for future values of pH, temperature, turbidity, and TDS.

### Phase V: Evaluation and Statistical Analysis
Forecasting performance evaluated separately across all 4 parameters:
- **MAE (Mean Absolute Error)**: Measures average error magnitude.
- **RMSE (Root Mean Square Error)**: Measures error magnitude with higher penalty on large deviations.
- **$R^2$ (Coefficient of Determination)**: Evaluates variance explained.
- Identifies which parameter is forecasted with highest accuracy.

---

## F. Risk and Safety

1. **Personal Protective Equipment (PPE)**: Use of gloves, laboratory coats, and proper footwear during water sampling and sensor handling.
2. **Field Safety**: Exercise extreme caution near wet, slippery, or uneven river banks; avoid entering unsafe areas or sampling during hazardous weather.
3. **Electrical Safety**: Proper water-resistant enclosures for ESP32, Raspberry Pi, wiring, power supplies, and battery packs.
4. **Sampling Protocol**: Conduct field work in teams/groups, log schedules with responsible contacts, monitor weather/river stage, and practice "Leave No Trace" environmental ethics.
5. **Sample & Equipment Handling**: Safe disposal of tested samples and thorough cleaning/maintenance of probes.

---

## G. Data Analysis

- **Descriptive Statistics**: Mean, standard deviation, and variation for pH, temperature, turbidity, and TDS (Montgomery & Runger, 2018).
- **Index Computation**: WAWQI integration according to Brown et al. (1970), Fashina et al. (2023), and Velasco et al. (2025).
- **Predictive Modeling**: Chronological train/test split, Random Forest Regression, and evaluation via MAE, RMSE, and $R^2$ (Hyndman & Athanasopoulos, 2021; James et al., 2021).

---

## References

- Abrajano, J. V., Botangen, K. A., Nabua, J., Apanay, J., & Peña, C. F. (2024). *IoT-based water quality monitoring system in Philippine off-grid communities*. arXiv. https://arxiv.org/abs/2410.14619
- Breiman, L. (2001). *Random forests*. Machine Learning, 45(1), 5–32. https://doi.org/10.1023/A:1010933404324
- Brown, R. M., McClelland, N. I., Deininger, R. A., & Tozer, R. G. (1970). *A water quality index—Do we dare?* Water and Sewage Works, 117(10), 339–343.
- Fashina, L., Luffman, I., Nandi, A., & Joyner, T. A. (2023). *Evaluation of karst spring water quality in northeast Tennessee using water quality indices*. Agrosystems, Geosciences & Environment, 6(4), e20429. https://doi.org/10.1002/agg2.20429
- Hyndman, R. J., & Athanasopoulos, G. (2021). *Forecasting: Principles and practice* (3rd ed.). OTexts. https://otexts.com/fpp3/
- James, G., Witten, D., Hastie, T., & Tibshirani, R. (2021). *An introduction to statistical learning: With applications in R* (2nd ed.). Springer. https://doi.org/10.1007/978-1-0716-1418-1
- Krklješ, D. B., Kitić, G. V., Petes, C. M., Birgermajer, S. S., Stanojev, J. D., Bajac, B. M., Panić, M. N., Radonić, V. M., Brčeski, I. D., Štravs, R. M., Janković, N. N., & Matović, J. B. (2024). *Multiparameter water quality monitoring system for continuous monitoring of fresh waters*. IEEE Sensors Journal, 24(7), 11211–11220. https://doi.org/10.1109/JSEN.2024.3368560
- Montgomery, D. C., & Runger, G. C. (2018). *Applied statistics and probability for engineers* (7th ed.). John Wiley & Sons.
- U.S. Environmental Protection Agency. (2009). *Handbook for analytical quality control in water and wastewater laboratories*. U.S. Environmental Protection Agency.
- Velasco, A. B., Mendoza, S. S., Naling, C. S., Ramos, M. T., Ilano, A. S., Pepito, C. C., & Magbanua, F. S. (2025). *Multivariate statistics and water quality index (WQI) approach for water quality assessment in tropical streams and wadeable rivers in Cagayan Valley, Central Visayas, and Caraga (the Philippines)*. Philippine Journal of Science, 154(6A), 1453–1465.

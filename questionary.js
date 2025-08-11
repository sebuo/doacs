// AFib CDSS – Single-Page Questionnaire (plain JS)
// Includes: updated Contraindications (no hard-coding), Interactions/PPI logic,
// and JS PATCH A — Minimal fade/slide-in on each step render.

(() => {
  const FORM = document.getElementById('questionary');
  const BTN_PREV = document.getElementById('btnPrev');
  const BTN_NEXT = document.getElementById('btnNext');
  const BTN_SUBMIT = document.getElementById('btnSubmit');
  const STEPPER = document.getElementById('stepper');
  const PROGRESS = document.getElementById('progress-bar');

  const state = {
    patient: {},
    chadsvasc: {},
    contraindications: {},
    interactions: {},
    recommendation: {},
  };

  const stepKeys = ['patient','chadsvasc','contraindications','interactions','recommendation'];

  const INTERACTING_DRUG_IDS = ['amiodaron','chinidin','dronedaron','diltiazem','verapamil','erythromycin','naproxen','fluconazol','ciclosporin','tacrolimus'];

  // ------- Helpers specific to CHADSVASC -------
  const ageIdToGroup = {
    age1: '<18',
    age2: '18-64',
    age3: '65-74',
    age4: '75-80',
    age5: '>=80'
  };
  function deriveAgeGroupFromNumeric(age){
    if(age == null || Number.isNaN(Number(age))) return null;
    const a = Number(age);
    if(a < 18) return '<18';
    if(a <= 64) return '18-64';
    if(a <= 74) return '65-74';
    if(a <= 80) return '75-80';
    return '>=80';
  }

  // ------- Step templates -------
  const TEMPLATES = {
    // Patient info
    0: () => /*html*/`
      <fieldset>
        <legend>Patient Information</legend>
        <div class="grid cols-2">
          <label class="label">Patient Name
            <input class="input" type="text" name="patient_name" pattern="\\S+" placeholder="e.g., Richi" required />
            <div class="help">No whitespace allowed</div>
          </label>
          <label class="label">Age
            <input class="input" type="number" name="age" min="0" max="120" inputmode="numeric" required />
            <div class="help">0–120 years</div>
          </label>
        </div>
        <div class="grid cols-3">
          <label class="label">Weight (kg)
            <input class="input" type="number" name="patient_weight" min="0" max="300" inputmode="numeric" required />
            <div class="help">0–300 kg</div>
          </label>
          <label class="label">Kreatinin (µmol/l)
            <input class="input" type="number" name="patient_kreatinin" min="30" max="120" inputmode="numeric" required />
            <div class="help">30–120 µmol/l</div>
          </label>
          <label class="label">GFR
            <input class="input" type="number" name="patient_gfr" min="0" max="120" inputmode="numeric" required />
            <div class="help">0–120</div>
          </label>
        </div>
      </fieldset>
    `,

    // CHA₂DS₂‑VASc
    1: () => /*html*/`
      <fieldset>
        <legend>CHA<sub>2</sub>DS<sub>2</sub>-VASc</legend>

        <div class="mb-3">
          <label class="label">Age group</label>
          <div class="grid">
            <label class="inline"><input type="radio" name="age" id="age1" value="0"> <span>&lt;18</span></label>
            <label class="inline"><input type="radio" name="age" id="age2" value="0"> <span>18-64</span></label>
            <label class="inline"><input type="radio" name="age" id="age3" value="1"> <span>65-74</span></label>
            <label class="inline"><input type="radio" name="age" id="age4" value="2"> <span>75-80</span></label>
            <label class="inline"><input type="radio" name="age" id="age5" value="2"> <span>&ge;80</span></label>
          </div>
          <div class="help">Auto-derived from Step 0 age when possible; you can still override.</div>
        </div>

        <div class="mb-3">
          <label class="label">Sex</label>
          <div class="grid">
            <label class="inline"><input type="radio" name="sex" id="male" value="0"> <span>Male</span></label>
            <label class="inline"><input type="radio" name="sex" id="female" value="1"> <span>Female</span></label>
          </div>
        </div>

        <p><strong>Pre-existing conditions</strong></p>
        <div class="grid cols-2">
          <label class="inline checkbox"><input type="checkbox" id="congestiveHF" name="congestiveHF" value="1"> Congestive Heart Failure</label>
          <label class="inline checkbox"><input type="checkbox" id="hypertension" name="hypertension" value="1"> Hypertension</label>
          <label class="inline checkbox"><input type="checkbox" id="diabetes" name="diabetes" value="1"> Diabetes Mellitus</label>
          <label class="inline checkbox"><input type="checkbox" id="strokeTIA" name="strokeTIA" value="2"> Stroke / TIA / Thromboembolism</label>
          <label class="inline checkbox"><input type="checkbox" id="vascularDisease" name="vascularDisease" value="1"> Vascular Disease (MI, PAD, Aortic plaque)</label>
        </div>

        <div class="notice ok" id="chads-preview" aria-live="polite">
          Score: <strong id="scoreResult">-</strong> — <span id="treatmentAdvice"></span>
        </div>
      </fieldset>
    `,

    // UPDATED Contraindications (no hard-coding; derived from patient/sex)
    2: () => /*html*/`
      <fieldset>
        <legend>Contraindications</legend>
        <p class="instructions"><strong>Please tick all contraindications present for this patient. Multiple selections allowed.</strong></p>
        <p class="subnote">Some contraindications (e.g., renal failure) are assessed automatically from previous patient data.</p>

        <div class="field">
          <label class="inline checkbox"><input type="checkbox" id="ci_active_bleeding" name="ci_active_bleeding" /> Active bleeding</label>
        </div>
        <div class="field">
          <label class="inline checkbox"><input type="checkbox" id="ci_endocarditis" name="ci_endocarditis" /> Acute bacterial endocarditis</label>
        </div>
        <div class="field">
          <label class="inline checkbox"><input type="checkbox" id="ci_gi_ulcus_active" name="ci_gi_ulcus_active" /> Active gastrointestinal ulcer</label>
        </div>
        <div class="field">
          <label class="inline checkbox"><input type="checkbox" id="ci_liver_failure_child_c_or_coagulopathy" name="ci_liver_failure_child_c_or_coagulopathy" /> Liver failure CHILD C or coagulopathy</label>
        </div>
        <div class="field" id="pregnantField" hidden>
          <label class="inline checkbox"><input type="checkbox" id="ci_pregnant_or_breastfeeding" name="ci_pregnant_or_breastfeeding" /> Pregnant or breastfeeding</label>
        </div>
        <div class="field">
          <label class="inline checkbox"><input type="checkbox" id="ci_drugs" name="ci_drugs" /> One or more interacting medications present</label>
          <div class="med-info">
            Includes: rifampicin, carbamazepin, phenobarbital, phenytoin, St. John's wort, HIV-Protease inhibitor, azol-antimycotic, clarithromycin
          </div>
        </div>

        <div class="nav">
          <button type="button" id="btnCICompute" class="btn">Check Contraindications</button>
          <button type="button" id="btnCIJson" class="btn secondary">Show JSON Output</button>
        </div>

        <div id="ciResult" class="notice" style="margin-top:12px" aria-live="polite"></div>

        <div class="notice" id="derivedFlags" style="margin-top:8px">
          <div>derived_ci_age (&lt;18): <span id="flag_ci_age" class="badge">False</span></div>
          <div>ci_renal_failure (GFR &lt; 15): <span id="flag_ci_renal" class="badge">False</span></div>
        </div>
      </fieldset>
    `,

    // Interactions & PPI
    3: () => /*html*/`
      <fieldset>
        <legend>Drug Interactions & PPI Indication</legend>
        <p class="help">Boolean inputs. Derived variables and recommendation compute instantly.</p>

        <!-- Base meds -->
        <div class="grid cols-2" role="group" aria-label="Base meds">
          <label class="inline checkbox"><input type="checkbox" id="aspirin" name="aspirin" /> Aspirin (ASS) <span class="help">Patient takes Aspirin (ASS)</span></label>
          <label class="inline checkbox"><input type="checkbox" id="clopidogrel" name="clopidogrel" /> Clopidogrel <span class="help">Patient takes Clopidogrel</span></label>
          <label class="inline checkbox"><input type="checkbox" id="nsaid" name="nsaid" /> NSAID <span class="help">Patient takes NSAIDs</span></label>
          <label class="inline checkbox"><input type="checkbox" id="ssri" name="ssri" /> SSRI or SNRI <span class="help">Patient takes an SSRI or SNRI</span></label>
        </div>

        <!-- Derived + Recommendation -->
        <div class="notice" aria-live="polite" id="ppiDerivedBox" style="margin-top:10px">
          <div>derived_dual_antiplatelet_therapy: <span id="dualBadge" class="badge">False</span></div>
          <div>derived_PPI_indication: <span id="ppiBadge" class="badge">False</span></div>
        </div>

        <div class="notice ok" aria-live="polite" id="ppiRecBox" style="margin-top:10px">
          <div><strong>PPI Recommendation</strong> <span id="ppiRec" class="badge">Not Recommended</span></div>
          <div id="explain" class="help"></div>
          <div class="help">Rule: <code>derived_PPI_indication = (dual_antiplatelet_therapy OR NSAID OR SSRI_or_SNRI)</code>.</div>
        </div>

        <!-- Additional interacting drugs (trigger block) -->
        <div style="margin-top:10px">
          <h3>Additional interacting drugs</h3>
          <p class="help">If any is checked, we evaluate three risk gates (from Patient step) and may expand a HAS-BLED form.</p>
          <div class="grid cols-2">
            <label class="inline checkbox"><input type="checkbox" id="amiodaron" name="amiodaron"> amiodaron</label>
            <label class="inline checkbox"><input type="checkbox" id="chinidin" name="chinidin"> chinidin</label>
            <label class="inline checkbox"><input type="checkbox" id="dronedaron" name="dronedaron"> dronedaron</label>
            <label class="inline checkbox"><input type="checkbox" id="diltiazem" name="diltiazem"> diltiazem</label>
            <label class="inline checkbox"><input type="checkbox" id="verapamil" name="verapamil"> verapamil</label>
            <label class="inline checkbox"><input type="checkbox" id="erythromycin" name="erythromycin"> erythromycin</label>
            <label class="inline checkbox"><input type="checkbox" id="naproxen" name="naproxen"> naproxen</label>
            <label class="inline checkbox"><input type="checkbox" id="fluconazol" name="fluconazol"> fluconazol</label>
            <label class="inline checkbox"><input type="checkbox" id="ciclosporin" name="ciclosporin"> ciclosporin</label>
            <label class="inline checkbox"><input type="checkbox" id="tacrolimus" name="tacrolimus"> tacrolimus</label>
          </div>

          <div class="notice" id="riskGates" hidden style="margin-top:10px">
            <div>Trigger active: <span id="drugTriggerBadge" class="badge">False</span></div>
            <div class="help" id="gateInputs">Inputs: age=—; weight=—; GFR=—</div>
            <div>age ≥ 75: <span id="ageGate" class="badge">False</span></div>
            <div>GFR &lt; 50: <span id="gfrGate" class="badge">False</span></div>
            <div>weight ≤ 60: <span id="wtGate" class="badge">False</span></div>
            <div><strong>Any gate true</strong>: <span id="anyGate" class="badge">False</span></div>
          </div>
        </div>

        <!-- HAS-BLED expandable stub -->
        <details id="hasBledBlock" hidden style="margin-top:10px">
          <summary>HAS-BLED Score (stub)</summary>
          <div class="notice" style="margin-top:8px">
            <p class="help">Auto-expanded when an interacting drug is present and any risk gate is true. Scoring logic to be implemented.</p>
            <div class="grid cols-2">
              <label class="inline checkbox"><input type="checkbox" id="hb-hypertension" name="hb-hypertension"> Uncontrolled Hypertension (SBP &gt; 160mmHg)</label>
              <label class="inline checkbox"><input type="checkbox" id="hb-abnormal" name="hb-abnormal"> Abnormal renal/liver</label>
              <label class="inline checkbox"><input type="checkbox" id="hb-stroke" name="hb-stroke"> Stroke history</label>
              <label class="inline checkbox"><input type="checkbox" id="hb-bleeding" name="hb-bleeding"> Bleeding history</label>
              <label class="inline checkbox"><input type="checkbox" id="hb-labile-inr" name="hb-labile-inr" disabled> Labile INR (N/A for DOAC)</label>
              <label class="inline checkbox"><input type="checkbox" id="hb-elderly" name="hb-elderly"> Elderly (&gt;65)</label>
              <label class="inline checkbox"><input type="checkbox" id="hb-drugs" name="hb-drugs"> Drugs/alcohol</label>
            </div>
          </div>
        </details>

        <div class="nav">
          <button type="button" id="resetInteractions" class="btn secondary" title="Clear Interactions step only">Reset</button>
        </div>
      </fieldset>
    `,

    4: () => /*html*/`
      <fieldset>
        <legend>Treatment Recommendation</legend>
        <div id="summary"></div>
        <hr />
        <div id="recommendationBox" class="notice ok"></div>
      </fieldset>
      <div class="output" id="finalJson"></div>
    `,
  };

  // ------- Validation + Computations -------
  function validateStep(stepIndex, dataForStep){
    switch(stepIndex){
      case 0: {
        const required = ['patient_name','age','patient_weight','patient_kreatinin','patient_gfr'];
        const missing = required.filter(k => dataForStep[k] === undefined || dataForStep[k] === null || dataForStep[k] === '');
        if(missing.length){ return { ok:false, message: 'Please fill all patient fields.' }; }
        if(!/^[^\s]+$/.test(String(dataForStep.patient_name))){ return { ok:false, message:'Patient name cannot contain whitespace.' }; }
        const age = Number(dataForStep.age), wt=Number(dataForStep.patient_weight), cr=Number(dataForStep.patient_kreatinin), gfr=Number(dataForStep.patient_gfr);
        if(!(age >= 0 && age <= 120)) return { ok:false, message:'Age must be between 0 and 120.' };
        if(!(wt >= 0 && wt <= 300)) return { ok:false, message:'Weight must be between 0 and 300.' };
        if(!(cr >= 30 && cr <= 120)) return { ok:false, message:'Kreatinin must be between 30 and 120 µmol/l.' };
        if(!(gfr >= 0 && gfr <= 120)) return { ok:false, message:'GFR must be between 0 and 120.' };
        return { ok:true };
      }
      case 1:
        computeChadsFromForm();
        return { ok:true };
      default:
        return { ok:true };
    }
  }

  // Calculate score
  function scoreChadsVascFromState(){
    const cv = state.chadsvasc || {};
    let score = 0;
    score += Number(cv.agePoints || 0);
    score += cv.sex === 'F' ? 1 : 0;
    score += cv.chf ? 1 : 0;
    score += cv.hypertension ? 1 : 0;
    score += cv.diabetes ? 1 : 0;
    score += cv.stroke_or_tia ? 2 : 0;
    score += cv.vascular_disease ? 1 : 0;
    return score;
  }

  function computeChadsFromForm(){
    if(currentStep !== 1) return;
    const ageRadio = FORM.querySelector('input[name="age"]:checked');
    const sexRadio = FORM.querySelector('input[name="sex"]:checked');

    let age_group = null, agePoints = 0;
    if(ageRadio){
      age_group = ageIdToGroup[ageRadio.id] || null;
      agePoints = Number(ageRadio.value) || 0;
    }

    let sex = null;
    if(sexRadio){ sex = sexRadio.id === 'male' ? 'M' : 'F'; }

    const chf = FORM.querySelector('#congestiveHF')?.checked || false;
    const hypertension = FORM.querySelector('#hypertension')?.checked || false;
    const diabetes = FORM.querySelector('#diabetes')?.checked || false;
    const stroke_or_tia = FORM.querySelector('#strokeTIA')?.checked || false;
    const vascular_disease = FORM.querySelector('#vascularDisease')?.checked || false;

    state.chadsvasc = {
      ...state.chadsvasc,
      age_group,
      agePoints,
      sex,
      chf,
      hypertension,
      diabetes,
      stroke_or_tia,
      vascular_disease
    };

    const score = scoreChadsVascFromState();
    state.chadsvasc.score = score;
    state.chadsvasc.derived_CHADSVASC_Score = score >= 2;

    const scoreEl = document.getElementById('scoreResult');
    const adviceEl = document.getElementById('treatmentAdvice');
    if(scoreEl) scoreEl.textContent = String(score);
    if(adviceEl){
      if(score < 2){ adviceEl.textContent = 'No DOAK treatment indicated'; adviceEl.className = 'advice-green'; }
      else { adviceEl.textContent = 'Continue with contraindication assessment'; adviceEl.className = 'advice-red'; }
    }
  }

  // ------- Render / Navigation -------
  let currentStep = 0;

  function render(){
    FORM.innerHTML = TEMPLATES[currentStep]();

    // JS PATCH A — Minimal fade/slide-in on each step mount
    const first = FORM.firstElementChild; // expected <fieldset>
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(first && !reduce){
      first.classList.remove('step-animate-in');
      void first.offsetWidth; // reflow to restart animation
      first.classList.add('step-animate-in');
    }

    hydrateForm(FORM, state[stepKeys[currentStep]] || {});

    BTN_PREV.disabled = currentStep === 0;
    BTN_NEXT.hidden = currentStep === stepKeys.length - 1;
    BTN_SUBMIT.hidden = !(currentStep === stepKeys.length - 1);

    [...STEPPER.children].forEach((li, idx) => {
      li.classList.toggle('is-active', idx === currentStep);
      li.classList.toggle('is-done', idx < currentStep);
    });

    const pct = (currentStep) / (stepKeys.length - 1) * 100;
    PROGRESS.style.width = `${pct}%`;

    if(currentStep === 1){
      FORM.addEventListener('change', computeChadsFromForm);
      const derivedGroup = deriveAgeGroupFromNumeric(state.patient.age);
      if(derivedGroup && !state.chadsvasc.age_group){
        const id = Object.entries(ageIdToGroup).find(([k,v]) => v === derivedGroup)?.[0];
        if(id){ const el = FORM.querySelector(`#${id}`); if(el){ el.checked = true; } }
        state.chadsvasc.age_group = derivedGroup;
        state.chadsvasc.agePoints = Number(FORM.querySelector(`#${id}`)?.value || 0);
      }
      if(state.chadsvasc.sex){
        const id = state.chadsvasc.sex === 'M' ? 'male' : 'female';
        const el = FORM.querySelector(`#${id}`); if(el) el.checked = true;
      }
      FORM.querySelector('#congestiveHF') && (FORM.querySelector('#congestiveHF').checked = !!state.chadsvasc.chf);
      FORM.querySelector('#hypertension') && (FORM.querySelector('#hypertension').checked = !!state.chadsvasc.hypertension);
      FORM.querySelector('#diabetes') && (FORM.querySelector('#diabetes').checked = !!state.chadsvasc.diabetes);
      FORM.querySelector('#strokeTIA') && (FORM.querySelector('#strokeTIA').checked = !!state.chadsvasc.stroke_or_tia);
      FORM.querySelector('#vascularDisease') && (FORM.querySelector('#vascularDisease').checked = !!state.chadsvasc.vascular_disease);
      computeChadsFromForm();
    }

    if(currentStep === 2){
      // Contraindications logic wiring
      const el = (id) => FORM.querySelector(`#${id}`);
      const badge = (id) => FORM.querySelector(`#${id}`);

      function getSex(){ return state.chadsvasc?.sex || null; }
      function getAge(){ const v = Number(state.patient?.age); return Number.isNaN(v) ? null : v; }
      function getGFR(){ const v = Number(state.patient?.patient_gfr); return Number.isNaN(v) ? null : v; }

      function computeDerivedFlags(){
        const age = getAge();
        const gfr = getGFR();
        const derived_ci_age = age != null ? (age < 18) : false;
        const ci_renal_failure = gfr != null ? (gfr < 15) : false;
        state.contraindications.derived_ci_age = derived_ci_age;
        state.contraindications.ci_renal_failure = ci_renal_failure;
        const ageFlag = badge('flag_ci_age');
        const renalFlag = badge('flag_ci_renal');
        if(ageFlag) ageFlag.textContent = derived_ci_age ? 'True' : 'False';
        if(renalFlag) renalFlag.textContent = ci_renal_failure ? 'True' : 'False';
      }

      function reflectSexVisibility(){
        const field = el('pregnantField');
        const sex = getSex();
        if(field){
          const isF = sex === 'F';
          field.hidden = !isF;
          if(!isF){ const cb = el('ci_pregnant_or_breastfeeding'); if(cb) cb.checked = false; }
          state.contraindications.sex = sex || undefined;
        }
      }

      function currentReasons(){
        const reasons = [];
        if(state.contraindications.derived_ci_age) reasons.push('Patient is under 18 years old');
        if(state.contraindications.ci_renal_failure) reasons.push('Renal failure (GFR < 15)');
        if(el('ci_active_bleeding')?.checked) reasons.push('Active bleeding');
        if(el('ci_endocarditis')?.checked) reasons.push('Acute bacterial endocarditis');
        if(el('ci_gi_ulcus_active')?.checked) reasons.push('Active gastrointestinal ulcer');
        if(el('ci_liver_failure_child_c_or_coagulopathy')?.checked) reasons.push('Liver failure CHILD C or liver disease with coagulopathy');
        if(getSex() === 'F' && el('ci_pregnant_or_breastfeeding')?.checked) reasons.push('Pregnant or breastfeeding');
        if(el('ci_drugs')?.checked) reasons.push('Interacting medication present');
        return reasons;
      }

      function computeCI(){
        ['ci_active_bleeding','ci_endocarditis','ci_gi_ulcus_active','ci_liver_failure_child_c_or_coagulopathy','ci_pregnant_or_breastfeeding','ci_drugs'].forEach(id => {
          const node = el(id); if(!node) return; state.contraindications[id] = !!node.checked;
        });
        computeDerivedFlags();
        const reasons = currentReasons();
        const derived_absolute_contraindication = reasons.length > 0;
        state.contraindications.derived_absolute_contraindication = derived_absolute_contraindication;
        const box = el('ciResult');
        if(box){
          if(derived_absolute_contraindication){
            box.classList.remove('ok'); box.classList.add('warn');
            box.innerHTML = `<strong>Absolute contraindications found:</strong><ul>` + reasons.map(c => `<li>${escapeHtml(c)}</li>`).join('') + `</ul><p><strong>Patient is NOT eligible for DOAC therapy.</strong></p>`;
          } else {
            box.classList.remove('warn'); box.classList.add('ok');
            box.innerHTML = `<strong>No contraindications detected. Patient is eligible for DOAC therapy.</strong>`;
          }
        }
      }

      function showCIJson(){
        computeCI();
        const data = {
          ci_active_bleeding: !!el('ci_active_bleeding')?.checked,
          ci_endocarditis: !!el('ci_endocarditis')?.checked,
          ci_gi_ulcus_active: !!el('ci_gi_ulcus_active')?.checked,
          ci_liver_failure_child_c_or_coagulopathy: !!el('ci_liver_failure_child_c_or_coagulopathy')?.checked,
          ci_pregnant_or_breastfeeding: getSex() === 'F' ? !!el('ci_pregnant_or_breastfeeding')?.checked : false,
          ci_drugs: !!el('ci_drugs')?.checked,
          derived_ci_age: !!state.contraindications.derived_ci_age,
          ci_renal_failure: !!state.contraindications.ci_renal_failure,
          sex: getSex()
        };
        const box = el('ciResult');
        if(box){ box.classList.remove('warn','ok'); box.innerHTML = `<pre>${escapeHtml(JSON.stringify(data, null, 2))}</pre>`; }
      }

      el('btnCICompute')?.addEventListener('click', computeCI);
      el('btnCIJson')?.addEventListener('click', showCIJson);
      FORM.addEventListener('change', (e) => {
        if(['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName)){
          computeDerivedFlags();
        }
      });

      reflectSexVisibility();
      computeDerivedFlags();
      computeCI();
    }

    if(currentStep === 3){
      const el = (id) => FORM.querySelector(`#${id}`);
      const badge = (id) => FORM.querySelector(`#${id}`);

      function computeInteractionsBase(){
        const aspirin = !!el('aspirin')?.checked;
        const clopidogrel = !!el('clopidogrel')?.checked;
        const nsaid = !!el('nsaid')?.checked;
        const ssri = !!el('ssri')?.checked;

        const dual = aspirin && clopidogrel; // derived_dual_antiplatelet_therapy
        const ppiInd = dual || nsaid || ssri; // final rule

        const dualBadge = badge('dualBadge');
        const ppiBadge = badge('ppiBadge');
        const ppiRec = badge('ppiRec');
        const explain = badge('explain');
        if(dualBadge){ dualBadge.textContent = dual ? 'True' : 'False'; }
        if(ppiBadge){ ppiBadge.textContent = ppiInd ? 'True' : 'False'; }
        if(ppiRec){ ppiRec.textContent = ppiInd ? 'PPI Recommended' : 'Not Recommended'; }
        if(explain){
          const reasons = [];
          if(dual) reasons.push('dual antiplatelet therapy');
          if(nsaid) reasons.push('NSAID');
          if(ssri) reasons.push('SSRI/SNRI');
          explain.innerHTML = `Inputs true: <strong>${reasons.length}</strong> [${reasons.join(', ') || 'none'}].`;
        }

        state.interactions = {
          ...state.interactions,
          Aspirin: aspirin,
          Clopidogrel: clopidogrel,
          NSAID: nsaid,
          SSRI_or_SNRI: ssri,
          derived_dual_antiplatelet_therapy: dual,
          derived_PPI_indication: ppiInd,
        };
      }

      function computeInteractionsTriggers(){
        const drugBoxes = INTERACTING_DRUG_IDS.map(id => el(id));
        const anyDrug = drugBoxes.some(cb => cb && cb.checked);
        const riskGates = el('riskGates');
        const drugTriggerBadge = badge('drugTriggerBadge');
        const ageGate = badge('ageGate');
        const gfrGate = badge('gfrGate');
        const wtGate = badge('wtGate');
        const anyGate = badge('anyGate');
        const gateInputs = badge('gateInputs');
        const hasBledBlock = el('hasBledBlock');

        const selectedDrugs = INTERACTING_DRUG_IDS.filter(id => el(id)?.checked);
        state.interactions.interacting_drug_list = selectedDrugs;
        state.interactions['interacting drugs'] = selectedDrugs.length > 0;

        if(riskGates){ riskGates.hidden = !anyDrug; }

        if(!anyDrug){
          if(drugTriggerBadge) { drugTriggerBadge.textContent = 'False'; }
          if(ageGate) { ageGate.textContent = 'False'; }
          if(gfrGate) { gfrGate.textContent = 'False'; }
          if(wtGate) { wtGate.textContent = 'False'; }
          if(anyGate) { anyGate.textContent = 'False'; }
          if(hasBledBlock){ hasBledBlock.hidden = true; hasBledBlock.open = false; }
          state.interactions.derived_age_RF = false;
          state.interactions.derived_GFR_RF = false;
          state.interactions.weight_under_60 = false;
          state.interactions.any_gate_true = false;
          return;
        }

        const age = Number(state.patient.age);
        const weight = Number(state.patient.patient_weight);
        const gfr = Number(state.patient.patient_gfr);
        if(gateInputs){ gateInputs.textContent = `Inputs: age=${age}; weight=${weight}; GFR=${gfr}`; }

        const ageTrue = age >= 75;
        const gfrTrue = gfr < 50;
        const wtTrue = weight <= 60;
        const anyTrue = ageTrue || gfrTrue || wtTrue;

        if(drugTriggerBadge){ drugTriggerBadge.textContent = 'True'; }
        if(ageGate){ ageGate.textContent = ageTrue ? 'True' : 'False'; }
        if(gfrGate){ gfrGate.textContent = gfrTrue ? 'True' : 'False'; }
        if(wtGate){ wtGate.textContent = wtTrue ? 'True' : 'False'; }
        if(anyGate){ anyGate.textContent = anyTrue ? 'True' : 'False'; }

        state.interactions.derived_age_RF = ageTrue;
        state.interactions.derived_GFR_RF = gfrTrue === true;
        state.interactions.weight_under_60 = wtTrue;
        state.interactions.any_gate_true = anyTrue;

        if(hasBledBlock){
          if(anyTrue){ hasBledBlock.hidden = false; hasBledBlock.open = true; }
          else { hasBledBlock.hidden = true; hasBledBlock.open = false; }
        }
      }

      function computeInteractionsAll(){
        computeInteractionsBase();
        computeInteractionsTriggers();
      }

      FORM.addEventListener('change', computeInteractionsAll);
      const resetBtn = el('resetInteractions');
      if(resetBtn){
        resetBtn.addEventListener('click', () => {
          ['aspirin','clopidogrel','nsaid','ssri', ...INTERACTING_DRUG_IDS].forEach(id => { const cb = el(id); if(cb) cb.checked = false; });
          computeInteractionsAll();
        });
      }

      computeInteractionsAll();
    }

    if(currentStep === 4){
      const summary = document.getElementById('summary');
      const recBox = document.getElementById('recommendationBox');
      const finalJson = document.getElementById('finalJson');
      const rec = buildRecommendation(state);
      recBox.classList.remove('ok','warn');
      recBox.classList.add(rec.tone);
      recBox.innerHTML = `
        <strong>Recommendation</strong><br/>
        ${escapeHtml(rec.text)}
        ${rec.interactionNotes.length ? `<div class="badge">Notes</div> ${escapeHtml(rec.interactionNotes.join(' '))}` : ''}
      `;
      summary.innerHTML = renderSummary(state);
      finalJson.textContent = JSON.stringify(state, null, 2);
    }
  }

  function renderSummary(s){
    const p = s.patient || {}; const c = s.chadsvasc || {}; const ci = s.contraindications || {};
    return `
      <div class="grid cols-2">
        <div>
          <h3>Patient</h3>
          <div class="notice">
            Name: ${escapeHtml(p.patient_name || '—')}<br/>
            Age: ${escapeHtml(p.age ?? '—')}<br/>
            Weight: ${escapeHtml(p.patient_weight ?? '—')} kg<br/>
            Kreatinin: ${escapeHtml(p.patient_kreatinin ?? '—')} µmol/l<br/>
            GFR: ${escapeHtml(p.patient_gfr ?? '—')}
          </div>
        </div>
        <div>
          <h3>CHA₂DS₂-VASc</h3>
          <div class="notice">
            Age group: ${escapeHtml(c.age_group || '—')}<br/>
            Sex: ${escapeHtml(c.sex || '—')}<br/>
            Score: <strong>${c.score ?? '—'}</strong><br/>
            DOAC indication (derived): <strong>${c.derived_CHADSVASC_Score ? 'True' : 'False'}</strong>
          </div>
          <div class="notice" style="margin-top:6px">
            <strong>Contraindications</strong><br/>
            Absolute CI (derived): <strong>${ci.derived_absolute_contraindication ? 'True' : 'False'}</strong><br/>
            Under 18: ${ci.derived_ci_age ? 'True' : 'False'}; Renal failure (GFR <15): ${ci.ci_renal_failure ? 'True' : 'False'}
          </div>
        </div>
      </div>
    `;
  }

  function buildRecommendation(fullState){
    const { patient, chadsvasc, contraindications, interactions } = fullState;

    const chads = Number(chadsvasc.score ?? 0);
    const hasContra = !!contraindications.derived_absolute_contraindication;

    let rec, tone;
    if(hasContra){ rec = 'Absolute contraindication(s) present. Anticoagulation likely NOT appropriate until addressed.'; tone='warn'; }
    else if(chads >= 2){ rec = 'Recommend anticoagulation (e.g., DOAC) unless other risks prevail. Consider shared decision-making.'; tone='ok'; }
    else if(chads === 1){ rec = 'Consider anticoagulation based on patient values and bleeding risk.'; tone='ok'; }
    else { rec = 'Anticoagulation generally not indicated; re-evaluate if risk profile changes.'; tone='ok'; }

    const egfr = (patient.patient_gfr !== undefined ? Number(patient.patient_gfr) : null);
    const interactionNotes = [];
    if(egfr !== null && !Number.isNaN(egfr) && egfr < 30){ interactionNotes.push('Impaired renal function — check DOAC dose/choice.'); }

    const medsTrue = [
      interactions.Aspirin ? 'Aspirin' : null,
      interactions.Clopidogrel ? 'Clopidogrel' : null,
      interactions.NSAID ? 'NSAID' : null,
      interactions.SSRI_or_SNRI ? 'SSRI/SNRI' : null,
    ].filter(Boolean);
    if(medsTrue.length){ interactionNotes.push(`Concomitant meds: ${medsTrue.join(', ')}.`); }

    const extraDrugs = Array.isArray(interactions.interacting_drug_list) ? interactions.interacting_drug_list : [];
    if(extraDrugs.length){ interactionNotes.push(`Other interacting drugs: ${extraDrugs.join(', ')}.`); }

    if(interactions.derived_PPI_indication){
      const reasons = [];
      if(interactions.derived_dual_antiplatelet_therapy) reasons.push('dual antiplatelet therapy');
      if(interactions.NSAID) reasons.push('NSAID');
      if(interactions.SSRI_or_SNRI) reasons.push('SSRI/SNRI');
      interactionNotes.push(`PPI recommended (${reasons.join(', ')}).`);
    } else {
      interactionNotes.push('PPI not routinely indicated from current inputs.');
    }

    if(interactions['interacting drugs']){
      const gates = [];
      if(interactions.derived_age_RF) gates.push('age ≥75');
      if(interactions.derived_GFR_RF) gates.push('GFR <50');
      if(interactions.weight_under_60) gates.push('weight ≤60kg');
      if(gates.length){ interactionNotes.push(`Risk gates positive: ${gates.join(', ')}.`); }
    }

    return { text: rec, tone, interactionNotes };
  }

  // ------- Generic form helpers -------
  function serializeForm(formEl){
    const fd = new FormData(formEl); const obj = {};
    for(const [k, v] of fd.entries()){ obj[k] = v; }
    formEl.querySelectorAll('input[type="checkbox"][name]').forEach(cb => { obj[cb.name] = cb.checked; });
    formEl.querySelectorAll('input[type="number"][name]').forEach(inp => {
      const name = inp.name; if(obj[name] === '' || obj[name] == null) return; const num = Number(obj[name]); obj[name] = Number.isNaN(num) ? obj[name] : num;
    });
    return obj;
  }

  function hydrateForm(formEl, data){
    Object.entries(data || {}).forEach(([k,v]) => {
      const el = formEl.querySelector(`[name="${CSS.escape(k)}"]`);
      if(!el) return;
      if(el.type === 'checkbox'){ el.checked = Boolean(v); }
      else { el.value = v; }
    });
  }

  function saveCurrentStep(){
    const data = serializeForm(FORM);
    const key = stepKeys[currentStep];
    state[key] = { ...state[key], ...data };
    if(currentStep === 1){
      computeChadsFromForm();
    }
    if(currentStep === 2){
      const age = Number(state.patient?.age);
      const gfr = Number(state.patient?.patient_gfr);
      state.contraindications.derived_ci_age = (age < 18);
      state.contraindications.ci_renal_failure = (gfr < 15);
      state.contraindications.sex = state.chadsvasc?.sex || state.contraindications.sex;
      state.contraindications.derived_absolute_contraindication = !!(
        state.contraindications.derived_ci_age || state.contraindications.ci_renal_failure ||
        state.contraindications.ci_active_bleeding || state.contraindications.ci_endocarditis ||
        state.contraindications.ci_gi_ulcus_active || state.contraindications.ci_liver_failure_child_c_or_coagulopathy ||
        (state.contraindications.sex === 'F' && state.contraindications.ci_pregnant_or_breastfeeding) ||
        state.contraindications.ci_drugs
      );
    }
  }

  BTN_PREV.addEventListener('click', () => { saveCurrentStep(); currentStep = Math.max(0, currentStep - 1); render(); });
  BTN_NEXT.addEventListener('click', () => {
    saveCurrentStep();
    const { ok, message } = validateStep(currentStep, state[stepKeys[currentStep]]);
    if(!ok){ alert(message || 'Please complete required fields.'); return; }
    currentStep = Math.min(stepKeys.length - 1, currentStep + 1); render();
  });
  FORM.addEventListener('submit', (e) => { e.preventDefault(); saveCurrentStep(); const { ok, message } = validateStep(currentStep, state[stepKeys[currentStep]]); if(!ok){ alert(message || 'Please complete required fields.'); return; } alert('Questionnaire finished. See the summary and JSON output below.'); });
  STEPPER.addEventListener('click', (e) => { const li = e.target.closest('li.step'); if(!li) return; const dest = Number(li.dataset.step); if(Number.isNaN(dest)) return; if(dest <= currentStep){ saveCurrentStep(); currentStep = dest; render(); } });

  // Init
  render();

  function escapeHtml(str){ if(str == null) return ''; return String(str).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;'); }
})();

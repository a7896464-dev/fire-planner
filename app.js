const form = document.querySelector("#fireForm");
const steps = Array.from(document.querySelectorAll(".step"));
const progressFill = document.querySelector("#progressFill");
const stepCounter = document.querySelector("#stepCounter");
const stepKicker = document.querySelector("#stepKicker");
const journeyImage = document.querySelector("#journeyImage");
const navSteps = Array.from(document.querySelectorAll(".journey-steps li"));

let latestResult = null;

const formatter = new Intl.NumberFormat("ko-KR");
const LOCAL_LEADS_KEY = "firePlanner.localLeads";
const CONSENT_FIELDS = ["privacyConsent", "thirdPartyConsent", "marketingConsent", "educationConsent"];

function valueOf(name) {
  const field = form.elements[name];
  return Number(field?.value || 0);
}

function textOf(name) {
  const field = form.elements[name];
  return String(field?.value || "").trim();
}

function checkedOf(name) {
  return Boolean(form.elements[name]?.checked);
}

function syncAllConsentState() {
  const allConsent = form.elements.allConsent;
  if (!allConsent) return;
  const consentFields = CONSENT_FIELDS.map((name) => form.elements[name]).filter(Boolean);
  const checkedCount = consentFields.filter((field) => field.checked).length;
  allConsent.checked = checkedCount === consentFields.length;
  allConsent.indeterminate = checkedCount > 0 && checkedCount < consentFields.length;
}

function manwon(value) {
  return `${formatter.format(Math.round(value))}만원`;
}

function eok(value) {
  const eokValue = value / 10000;
  if (eokValue >= 1) return `약 ${formatter.format(Math.round(eokValue * 10) / 10)}억`;
  return manwon(value);
}

function monthlyRealRate(annualReturn, inflation = 0.025) {
  return Math.pow((1 + annualReturn) / (1 + inflation), 1 / 12) - 1;
}

function monthsToTarget({ currentAssets, monthlyInvestment, targetAssets, annualReturn }) {
  if (currentAssets >= targetAssets) return 0;

  const monthlyRate = monthlyRealRate(annualReturn);
  let assets = currentAssets;
  for (let month = 1; month <= 720; month += 1) {
    assets = assets * (1 + monthlyRate) + monthlyInvestment;
    if (assets >= targetAssets) return month;
  }
  return null;
}

function ageFromMonths(currentAge, months) {
  if (months === null) return null;
  return currentAge + months / 12;
}

function getLevel(readiness, lowAge, targetAge) {
  if (readiness >= 90 || lowAge <= targetAge) return "안정";
  if (readiness >= 55 || lowAge <= targetAge + 8) return "주의";
  return "점검 필요";
}

function topVariables({ targetMonthlyExpense, monthlyInvestment, currentAssets, expectedReturn, targetFireAge, lowAge }) {
  const variables = [];
  if (monthlyInvestment < targetMonthlyExpense * 0.35) variables.push("월 투자 가능액");
  if (targetMonthlyExpense >= 350) variables.push("목표 생활비");
  if (currentAssets < targetMonthlyExpense * 12) variables.push("현재 준비자산");
  if (expectedReturn <= 0.03) variables.push("기대수익률");
  if (lowAge && lowAge > targetFireAge + 5) variables.push("목표 파이어 나이");
  return [...new Set(variables)].slice(0, 2);
}

function calculateFireResult(includeAdvanced = false) {
  const currentAge = valueOf("currentAge");
  const targetFireAge = valueOf("targetFireAge");
  const targetMonthlyExpense = valueOf("targetMonthlyExpense");
  const currentAssets = valueOf("currentAssets");
  const monthlyInvestment = valueOf("monthlyInvestment");
  const expectedReturn = valueOf("expectedReturn") / 100;

  const monthlyIncome = includeAdvanced ? valueOf("monthlyIncome") : 0;
  const additionalMonthlyIncome = includeAdvanced ? valueOf("additionalMonthlyIncome") : 0;
  const expectedPensionIncome = includeAdvanced ? valueOf("expectedPensionIncome") : 0;
  const monthlyDebtPayment = includeAdvanced ? valueOf("monthlyDebtPayment") : 0;

  const incomeOffset = additionalMonthlyIncome + expectedPensionIncome;
  const monthlyNeed = Math.max(targetMonthlyExpense - incomeOffset, targetMonthlyExpense * 0.35);
  const debtRiskBuffer = includeAdvanced ? Math.min(monthlyDebtPayment * 12, targetMonthlyExpense * 6) : 0;
  const annualNeed = monthlyNeed * 12;
  const targetAssetsLow = annualNeed * 25 + debtRiskBuffer;
  const targetAssetsHigh = annualNeed * 30 + debtRiskBuffer;
  const lowMonths = monthsToTarget({ currentAssets, monthlyInvestment, targetAssets: targetAssetsLow, annualReturn: expectedReturn });
  const highMonths = monthsToTarget({ currentAssets, monthlyInvestment, targetAssets: targetAssetsHigh, annualReturn: expectedReturn });
  const lowAge = ageFromMonths(currentAge, lowMonths);
  const highAge = ageFromMonths(currentAge, highMonths);
  const readiness = Math.min(999, (currentAssets / targetAssetsLow) * 100);
  const level = getLevel(readiness, lowAge || 999, targetFireAge);
  const variables = topVariables({
    targetMonthlyExpense,
    monthlyInvestment,
    currentAssets,
    expectedReturn,
    targetFireAge,
    lowAge,
  });

  const ageRange =
    lowAge === null
      ? "현재 속도 기준 60년 이상 필요"
      : `${Math.floor(lowAge)}~${highAge === null ? Math.floor(lowAge + 8) : Math.ceil(highAge)}세`;

  return {
    level,
    ageRange,
    targetAssetsLow,
    targetAssetsHigh,
    readiness,
    variables: variables.length ? variables : ["월 투자 가능액", "목표 생활비"],
    assumptions: {
      withdrawalRule: "25~30배수",
      inflation: "연 2.5%",
      expectedReturn: `${valueOf("expectedReturn")}%`,
      includeAdvanced,
    },
    raw: {
      currentAge,
      targetFireAge,
      targetMonthlyExpense,
      currentAssets,
      monthlyInvestment,
      expectedReturn: valueOf("expectedReturn"),
      monthlyIncome,
      additionalMonthlyIncome,
      expectedPensionIncome,
      monthlyDebtPayment,
      calculatedMonthlyNeed: monthlyNeed,
    },
  };
}

function renderResult(result) {
  document.querySelector("#resultLevel").textContent = `진단 결과: ${result.level}`;
  document.querySelector("#resultAgeRange").textContent = `예상 파이어 구간: ${result.ageRange}`;
  document.querySelector("#resultTargetAssets").textContent = `${eok(result.targetAssetsLow)}~${eok(result.targetAssetsHigh)}`;
  document.querySelector("#resultReadiness").textContent = `${Math.round(result.readiness)}%`;
  document.querySelector("#resultVariables").textContent = result.variables.join(" / ");
  document.querySelector("#resultSummary").textContent =
    `현재 입력값 기준으로 계산한 요약 결과입니다. 상세분석에서는 고정비, 대출, 추가소득, 예상 연금소득을 반영해 목표자산과 도달 구간을 다시 확인합니다.`;
}

function setStep(stepNumber) {
  steps.forEach((step) => step.classList.toggle("active", step.dataset.step === String(stepNumber)));
  const currentStep = document.querySelector(`.step[data-step="${stepNumber}"]`);
  const maxVisibleStep = 13;
  const progressStep = Math.min(stepNumber, maxVisibleStep);
  const progress = Math.max(8, Math.round((progressStep / maxVisibleStep) * 100));
  progressFill.style.width = `${progress}%`;
  stepCounter.textContent = stepNumber >= 14 ? "완료" : `${progressStep} / ${maxVisibleStep}`;
  stepKicker.textContent = stageLabel(currentStep?.dataset.stage);
  if (currentStep?.dataset.image) journeyImage.src = currentStep.dataset.image;
  navSteps.forEach((item) => {
    const navStep = Number(item.dataset.navStep);
    item.classList.toggle("active", stepNumber >= navStep);
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function stageLabel(stage) {
  const labels = {
    basic: "기본 계산",
    result: "요약 결과",
    advanced: "상세분석",
    contact: "신청 저장",
    done: "완료",
  };
  return labels[stage] || "파이어 계산";
}

function validateStep(stepNumber) {
  const step = document.querySelector(`.step[data-step="${stepNumber}"]`);
  const fields = Array.from(step.querySelectorAll("input, select, textarea"));
  const invalid = fields.find((field) => !field.checkValidity());
  if (invalid) {
    invalid.reportValidity();
    return false;
  }
  return true;
}

function collectPayload() {
  const advancedResult = calculateFireResult(true);
  const basic = {
    currentAge: valueOf("currentAge"),
    targetFireAge: valueOf("targetFireAge"),
    targetMonthlyExpense: valueOf("targetMonthlyExpense"),
    currentAssets: valueOf("currentAssets"),
    monthlyInvestment: valueOf("monthlyInvestment"),
    expectedReturn: valueOf("expectedReturn"),
  };
  const advanced = {
    monthlyIncome: valueOf("monthlyIncome"),
    fixedMonthlyCost: valueOf("fixedMonthlyCost"),
    monthlyDebtPayment: valueOf("monthlyDebtPayment"),
    additionalMonthlyIncome: valueOf("additionalMonthlyIncome"),
    expectedPensionIncome: valueOf("expectedPensionIncome"),
  };

  return {
    source: {
      channel: "meta-single-image",
      campaign: "fire-calculator-mvp",
      creative: new URLSearchParams(window.location.search).get("creative") || "",
    },
    contact: {
      name: textOf("name"),
      phone: textOf("phone"),
      preferredTime: textOf("preferredTime"),
    },
    consent: {
      privacy: checkedOf("privacyConsent"),
      thirdParty: checkedOf("thirdPartyConsent"),
      marketing: checkedOf("marketingConsent"),
      education: checkedOf("educationConsent"),
      all: checkedOf("allConsent"),
    },
    answers: { basic, advanced },
    result: advancedResult,
    status: "new",
    assignedTo: "",
    notes: "",
  };
}

function showInlineError(message) {
  const existing = document.querySelector(".error-box");
  if (existing) existing.remove();

  const error = document.createElement("div");
  error.className = "error-box";
  error.textContent = message;
  const active = document.querySelector(".step.active");
  active.appendChild(error);
}

function saveLeadToLocalBrowser(payload) {
  const now = new Date().toISOString();
  const lead = {
    id: `${now.slice(0, 10)}-${crypto.randomUUID()}`,
    createdAt: now,
    updatedAt: now,
    ...payload,
    audit: [{ at: now, action: "created", by: "file-preview" }],
  };
  const leads = JSON.parse(localStorage.getItem(LOCAL_LEADS_KEY) || "[]");
  leads.unshift(lead);
  localStorage.setItem(LOCAL_LEADS_KEY, JSON.stringify(leads));
  return lead;
}

document.addEventListener("click", (event) => {
  const next = event.target.closest("[data-next]");
  const prev = event.target.closest("[data-prev]");

  if (next) {
    const nextStep = Number(next.dataset.next);
    const activeStep = Number(document.querySelector(".step.active").dataset.step);
    if (!validateStep(activeStep)) return;
    if (next.dataset.action === "calculate-basic") {
      latestResult = calculateFireResult(false);
      renderResult(latestResult);
    }
    setStep(nextStep);
  }

  if (prev) setStep(Number(prev.dataset.prev));
});

form.addEventListener("change", (event) => {
  if (event.target.name === "allConsent") {
    CONSENT_FIELDS.forEach((name) => {
      const field = form.elements[name];
      if (field) field.checked = event.target.checked;
    });
    syncAllConsentState();
    return;
  }

  if (CONSENT_FIELDS.includes(event.target.name)) syncAllConsentState();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;

  try {
    const encryptedLead = await window.FireCrypto.encryptLeadPayload(collectPayload());
    const submitEndpoint = window.FIRE_SUBMIT_ENDPOINT || "";
    if (submitEndpoint) {
      await fetch(submitEndpoint, {
        method: "POST",
        mode: "no-cors",
        headers: { "content-type": "text/plain;charset=utf-8" },
        body: JSON.stringify(encryptedLead),
      });
      setStep(14);
      return;
    }

    if (window.location.protocol === "file:") {
      saveLeadToLocalBrowser(encryptedLead);
      setStep(14);
      return;
    }
    const response = await fetch("/api/leads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(encryptedLead),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "저장에 실패했습니다.");
    setStep(14);
  } catch (error) {
    showInlineError(error.message);
  }
});

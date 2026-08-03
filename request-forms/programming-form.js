import { setSectionInputsEnabled } from "./shared.js";

export function createProgrammingRequestForm({ elements, helpers }) {
  const {
    section,
    clientName,
    clientCode,
    contactName,
    contactRole,
    contactEmail,
    contactPhone,
    title,
    description,
    currentBehavior,
    expectedBehavior,
    justification,
    videoLink
  } = elements;

  const {
    clearFieldValidation,
    formatCnpj,
    formatCpfCnpj,
    formatPhone,
    normalizeUrl,
    renderAttachmentList,
    sanitizeText,
    setPhoneValidity,
    setSpecificDocumentValidity
  } = helpers;

  function setActive(active, editable) {
    section.hidden = !active;
    setSectionInputsEnabled(section, active && editable);
    if (active) renderAttachmentList();
  }

  function reset() {
    clearFieldValidation(clientCode);
    clearFieldValidation(contactPhone);
  }

  function populate(item = {}) {
    clientName.value = item.clientName || "";
    clientCode.value = formatCpfCnpj(item.clientCode || "");
    contactName.value = item.contactName || "";
    contactRole.value = item.contactRole || "";
    contactEmail.value = item.contactEmail || "";
    contactPhone.value = formatPhone(item.contactPhone || "");
    title.value = item.title || "";
    description.value = item.description || "";
    currentBehavior.value = item.currentBehavior || "";
    expectedBehavior.value = item.expectedBehavior || "";
    justification.value = item.justification || "";
    videoLink.value = item.videoLink || item.externalLink || "";

    setSpecificDocumentValidity(clientCode, "cnpj", {
      required: true,
      showMessage: false
    });
    setPhoneValidity(contactPhone, { showMessage: false });
  }

  function buildPayload() {
    const externalLinkRaw = videoLink.value.trim();
    const normalizedVideoLink = normalizeUrl(externalLinkRaw);
    if (externalLinkRaw && !normalizedVideoLink) {
      return {
        error: "Informe um link de vídeo válido iniciado por http:// ou https://."
      };
    }

    const data = {
      clientName: sanitizeText(clientName.value),
      clientCode: formatCnpj(clientCode.value),
      contactName: sanitizeText(contactName.value),
      contactRole: sanitizeText(contactRole.value),
      contactEmail: sanitizeText(contactEmail.value),
      contactPhone: formatPhone(contactPhone.value),
      title: sanitizeText(title.value),
      description: sanitizeText(description.value),
      currentBehavior: sanitizeText(currentBehavior.value),
      expectedBehavior: sanitizeText(expectedBehavior.value),
      justification: sanitizeText(justification.value),
      videoLink: normalizedVideoLink,
      externalLink: normalizedVideoLink,
      cancellationItems: []
    };

    if (
      !setSpecificDocumentValidity(clientCode, "cnpj", {
        required: true,
        showMessage: true
      })
    ) {
      clientCode.focus();
      return { error: "Informe um CNPJ válido para o cliente." };
    }

    if (!setPhoneValidity(contactPhone, { showMessage: true })) {
      contactPhone.focus();
      return {
        error: "Informe um telefone fixo ou celular com DDD válido."
      };
    }

    if (
      !data.clientName ||
      !data.clientCode ||
      !data.contactName ||
      !data.contactRole ||
      !data.contactEmail ||
      !data.contactPhone ||
      !data.title ||
      !data.description ||
      !data.currentBehavior ||
      !data.expectedBehavior ||
      !data.justification
    ) {
      return {
        error: "Preencha todos os campos obrigatórios da solicitação de programação."
      };
    }

    return { data };
  }

  function focus() {
    clientName.focus();
  }

  return {
    type: "programacao",
    setActive,
    reset,
    populate,
    buildPayload,
    focus
  };
}

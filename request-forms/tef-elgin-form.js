import { setSectionInputsEnabled } from "./shared.js";

export function createTefElginRequestForm({ elements, helpers }) {
  const {
    section,
    cnpj,
    clientName,
    operatingSystem,
    ram,
    systemUsed,
    establishmentNumber,
    pinpadLogicalNumber,
    pinpadModel,
    acquirer,
    ownerName,
    ownerCpf,
    contactPhone,
    contactEmail,
    agreedValue,
    usesPix,
    additionalInfoField,
    additionalInfo,
    additionalInfoCount
  } = elements;

  const {
    clearFieldValidation,
    formatCnpj,
    formatCpf,
    formatPhone,
    sanitizeText,
    setPhoneValidity,
    setSpecificDocumentValidity
  } = helpers;

  let active = false;
  let editable = true;

  function updatePixFields() {
    const shouldShow = active && usesPix.checked;
    additionalInfoField.hidden = !shouldShow;
    additionalInfo.disabled = !shouldShow || !editable;
    additionalInfoCount.textContent = String(additionalInfo.value.length);
  }

  function setActive(nextActive, nextEditable) {
    active = nextActive;
    editable = nextEditable;
    section.hidden = !active;
    setSectionInputsEnabled(section, active && editable);
    updatePixFields();
  }

  function reset() {
    clearFieldValidation(cnpj);
    clearFieldValidation(ownerCpf);
    clearFieldValidation(contactPhone);
    usesPix.checked = false;
    additionalInfo.value = "";
    updatePixFields();
  }

  function populate(item = {}) {
    cnpj.value = formatCnpj(item.tefCnpj || item.clientCode || "");
    const legacyClientName =
      item.clientName && item.clientName !== item.tefCnpj && item.clientName !== item.clientCode
        ? item.clientName
        : "";
    clientName.value = item.tefClientName || legacyClientName;
    operatingSystem.value = item.tefOperatingSystem || "";
    ram.value = item.tefRam || "";
    systemUsed.value = item.tefSystemUsed || "";
    establishmentNumber.value = item.tefEstablishmentNumber || "";
    pinpadLogicalNumber.value = item.tefPinpadLogicalNumber || "";
    pinpadModel.value = item.tefPinpadModel || "";
    acquirer.value = item.tefAcquirer || "";
    ownerName.value = item.tefOwnerName || "";
    ownerCpf.value = formatCpf(item.tefOwnerCpf || "");
    contactPhone.value = formatPhone(item.tefContactPhone || "");
    contactEmail.value = item.tefContactEmail || "";
    agreedValue.value = item.tefAgreedValue || "";
    usesPix.checked = item.tefUsesPix === true;
    additionalInfo.value = item.tefAdditionalInfo || "";

    setSpecificDocumentValidity(cnpj, "cnpj", {
      required: true,
      showMessage: false
    });
    setSpecificDocumentValidity(ownerCpf, "cpf", {
      required: true,
      showMessage: false
    });
    setPhoneValidity(contactPhone, { showMessage: false });
    updatePixFields();
  }

  function buildPayload() {
    const pixEnabled = usesPix.checked;
    const data = {
      tefCnpj: formatCnpj(cnpj.value),
      tefClientName: sanitizeText(clientName.value),
      tefOperatingSystem: sanitizeText(operatingSystem.value),
      tefRam: sanitizeText(ram.value),
      tefSystemUsed: sanitizeText(systemUsed.value),
      tefEstablishmentNumber: sanitizeText(establishmentNumber.value),
      tefPinpadLogicalNumber: sanitizeText(pinpadLogicalNumber.value),
      tefPinpadModel: sanitizeText(pinpadModel.value),
      tefAcquirer: sanitizeText(acquirer.value),
      tefOwnerName: sanitizeText(ownerName.value),
      tefOwnerCpf: formatCpf(ownerCpf.value),
      tefContactPhone: formatPhone(contactPhone.value),
      tefContactEmail: sanitizeText(contactEmail.value),
      tefAgreedValue: sanitizeText(agreedValue.value),
      tefUsesPix: pixEnabled,
      tefAdditionalInfo: pixEnabled ? sanitizeText(additionalInfo.value) : ""
    };

    if (
      !setSpecificDocumentValidity(cnpj, "cnpj", {
        required: true,
        showMessage: true
      })
    ) {
      cnpj.focus();
      return { error: "Informe um CNPJ válido para a solicitação TEF." };
    }
    if (
      !setSpecificDocumentValidity(ownerCpf, "cpf", {
        required: true,
        showMessage: true
      })
    ) {
      ownerCpf.focus();
      return { error: "Informe um CPF válido para o proprietário." };
    }
    if (!setPhoneValidity(contactPhone, { showMessage: true })) {
      contactPhone.focus();
      return {
        error: "Informe um telefone fixo ou celular com DDD válido."
      };
    }

    const requiredValues = [
      data.tefCnpj,
      data.tefClientName,
      data.tefOperatingSystem,
      data.tefRam,
      data.tefSystemUsed,
      data.tefEstablishmentNumber,
      data.tefPinpadLogicalNumber,
      data.tefPinpadModel,
      data.tefAcquirer,
      data.tefOwnerName,
      data.tefOwnerCpf,
      data.tefContactPhone,
      data.tefContactEmail,
      data.tefAgreedValue
    ];
    if (requiredValues.some((value) => !value)) {
      return {
        error: "Preencha todos os campos obrigatórios da solicitação TEF Elgin."
      };
    }

    const title = `TEF Elgin — ${data.tefClientName}`;
    const description = [
      `CNPJ: ${data.tefCnpj}`,
      `Sistema operacional: ${data.tefOperatingSystem}`,
      `Memória RAM: ${data.tefRam}`,
      `Sistema utilizado: ${data.tefSystemUsed}`,
      `Adquirente: ${data.tefAcquirer}`,
      `Proprietário: ${data.tefOwnerName}`,
      `Utiliza PIX: ${data.tefUsesPix ? "Sim" : "Não"}`,
      data.tefUsesPix && data.tefAdditionalInfo
        ? `Informações adicionais do PIX: ${data.tefAdditionalInfo}`
        : ""
    ]
      .filter(Boolean)
      .join("\n");

    return {
      data: {
        priority: "normal",
        clientName: data.tefClientName,
        clientCode: data.tefCnpj,
        contactName: data.tefOwnerName,
        contactRole: "Proprietário",
        contactEmail: data.tefContactEmail,
        contactPhone: data.tefContactPhone,
        title: title.slice(0, 140),
        description: description.slice(0, 3000),
        currentBehavior: "",
        expectedBehavior: "",
        justification: "",
        videoLink: "",
        externalLink: "",
        cancellationItems: [],
        ...data
      }
    };
  }

  function focus() {
    cnpj.focus();
  }

  function bindEvents() {
    usesPix.addEventListener("change", updatePixFields);
    additionalInfo.addEventListener("input", updatePixFields);
  }

  return {
    type: "tef_elgin",
    setActive,
    reset,
    populate,
    buildPayload,
    focus,
    bindEvents,
    updatePixFields
  };
}

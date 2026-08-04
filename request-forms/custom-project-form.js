import { STANDARD_FIELD_DEFINITIONS, validateDynamicRequest } from "../project-system.js";
import { dynamicInputId, setSectionInputsEnabled } from "./shared.js";

export function createCustomProjectRequestForm({ elements, helpers }) {
  const { section, title, description, standardFields, customFields } = elements;
  const { escapeHtml, formatCpfCnpj, formatPhone, isValidCpfCnpj, isValidPhone, query, queryAll } = helpers;

  let currentProject = null;

  function setActive(active, editable) {
    section.hidden = !active;
    setSectionInputsEnabled(section, active && editable);
  }

  function reset() {
    currentProject = null;
    title.textContent = "Projeto";
    description.textContent = "Preencha os campos configurados para este projeto.";
    standardFields.innerHTML = "";
    customFields.innerHTML = "";
  }

  function render(project, item = null, editable = true) {
    currentProject = project;
    const values = item || {};
    const standardValues = {
      document: values.document || values.clientCode || "",
      companyName: values.companyName || values.clientName || "",
      phone: values.phone || values.contactPhone || "",
      email: values.email || values.contactEmail || ""
    };

    title.textContent = project.name;
    description.textContent = project.description || "Preencha os campos configurados para este projeto.";

    standardFields.innerHTML = Object.entries(STANDARD_FIELD_DEFINITIONS)
      .map(([key, definition]) => {
        const config = project.standardFields?.[key];
        if (!config?.enabled) return "";
        const required = config.required === true;
        const id = dynamicInputId("custom-standard", key);
        const inputType = definition.type === "email" ? "email" : definition.type === "phone" ? "tel" : "text";
        const inputMode = ["document", "phone"].includes(definition.type) ? ' inputmode="numeric"' : "";
        const className =
          definition.type === "document"
            ? "dynamic-document-input"
            : definition.type === "phone"
              ? "dynamic-phone-input"
              : "";
        const placeholder =
          definition.type === "document"
            ? "CPF ou CNPJ"
            : definition.type === "phone"
              ? "(00) 00000-0000"
              : definition.type === "email"
                ? "nome@empresa.com.br"
                : "Razão social ou nome fantasia";
        return `<label class="field"><span>${escapeHtml(definition.label)}${required ? " *" : ""}</span><input id="${escapeHtml(id)}" data-custom-standard="${escapeHtml(key)}" class="${className}" type="${inputType}"${inputMode} maxlength="${definition.maxLength}" placeholder="${escapeHtml(placeholder)}" value="${escapeHtml(standardValues[key] || "")}" ${required ? "required" : ""}></label>`;
      })
      .join("");

    const customValues =
      values.customFieldValues && typeof values.customFieldValues === "object" ? values.customFieldValues : {};
    customFields.innerHTML = project.customFields
      .filter((field) => field.active !== false)
      .sort((first, second) => first.order - second.order)
      .map(
        (field) =>
          `<label class="field form-span-2"><span>${escapeHtml(field.label)}${field.required ? " *" : ""}</span><textarea data-custom-field="${escapeHtml(field.id)}" rows="5" maxlength="${field.maxLength || 1000}" placeholder="${escapeHtml(field.placeholder || "Digite as informações solicitadas.")}" ${field.required ? "required" : ""}>${escapeHtml(customValues[field.id] || "")}</textarea><small class="field-counter"><span data-custom-counter="${escapeHtml(field.id)}">${String(customValues[field.id] || "").length}</span>/${field.maxLength || 1000} caracteres</small></label>`
      )
      .join("");

    queryAll("[data-custom-field]", customFields).forEach((textarea) => {
      textarea.addEventListener("input", () => {
        const counter = query(`[data-custom-counter="${CSS.escape(textarea.dataset.customField)}"]`, customFields);
        if (counter) counter.textContent = String(textarea.value.length);
      });
    });
    queryAll(".dynamic-document-input", standardFields).forEach((input) =>
      input.addEventListener("input", () => {
        input.value = formatCpfCnpj(input.value);
      })
    );
    queryAll(".dynamic-phone-input", standardFields).forEach((input) =>
      input.addEventListener("input", () => {
        input.value = formatPhone(input.value);
      })
    );
    setSectionInputsEnabled(section, editable);
  }

  function collectValues() {
    const standard = {};
    const custom = {};
    queryAll("[data-custom-standard]", standardFields).forEach((input) => {
      standard[input.dataset.customStandard] = input.value;
    });
    queryAll("[data-custom-field]", customFields).forEach((input) => {
      custom[input.dataset.customField] = input.value;
    });
    return { standard, custom };
  }

  function buildPayload(project = currentProject) {
    if (!project) return { error: "O projeto personalizado não foi identificado." };
    const result = validateDynamicRequest(project, collectValues(), {
      isValidDocument: isValidCpfCnpj,
      isValidPhone,
      isValidEmail: (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ""))
    });
    if (!result.valid) {
      return { error: result.errors[0] || "Revise os campos do projeto." };
    }

    const standard = result.values.standard;
    const custom = result.values.custom;
    const firstCustom = project.customFields.find((field) => field.active !== false && custom[field.id]);
    const identifier =
      standard.companyName || standard.document || (firstCustom ? custom[firstCustom.id].slice(0, 80) : "Solicitação");
    const descriptionLines = [
      standard.document ? `CPF/CNPJ: ${formatCpfCnpj(standard.document)}` : "",
      standard.companyName ? `Razão Social: ${standard.companyName}` : "",
      standard.phone ? `Telefone: ${formatPhone(standard.phone)}` : "",
      standard.email ? `E-mail: ${standard.email}` : "",
      ...project.customFields
        .filter((field) => field.active !== false && custom[field.id])
        .sort((first, second) => Number(first.order || 0) - Number(second.order || 0))
        .map((field) => `${field.label}: ${custom[field.id]}`)
    ].filter(Boolean);

    return {
      data: {
        priority: "normal",
        document: standard.document ? formatCpfCnpj(standard.document) : "",
        companyName: standard.companyName || "",
        phone: standard.phone ? formatPhone(standard.phone) : "",
        email: standard.email || "",
        clientName: standard.companyName || standard.document || project.name,
        clientCode: standard.document ? formatCpfCnpj(standard.document) : "",
        contactName: "",
        contactRole: "",
        contactEmail: standard.email || "",
        contactPhone: standard.phone ? formatPhone(standard.phone) : "",
        title: `${project.name} — ${identifier}`.slice(0, 140),
        description: descriptionLines.join("\n").slice(0, 3000),
        currentBehavior: "",
        expectedBehavior: "",
        justification: "",
        videoLink: "",
        externalLink: "",
        cancellationItems: [],
        customFieldValues: custom,
        projectFormSnapshot: {
          projectName: project.name,
          standardFields: project.standardFields || {},
          customFields: project.customFields.map((field) => ({
            id: field.id,
            label: field.label,
            required: field.required,
            maxLength: field.maxLength,
            order: field.order
          }))
        }
      }
    };
  }

  function focus() {
    query("input, textarea", section)?.focus();
  }

  return {
    type: "custom",
    setActive,
    reset,
    render,
    buildPayload,
    focus
  };
}

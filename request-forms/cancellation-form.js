import { setSectionInputsEnabled } from "./shared.js";

export function createCancellationRequestForm({ elements, state, helpers, callbacks, maxItems }) {
  const { section, entry, cnpjInput, clientNameInput, reasonInput, listCount, list, addButton, requestError } =
    elements;

  const {
    createItemId,
    escapeHtml,
    formatDateTime,
    formatCpfCnpj,
    isAdmin,
    isArchived,
    sanitizeText,
    setDocumentValidity,
    showFormError,
    showToast
  } = helpers;

  function crmStatusHtml(item, index) {
    const checked = item.crmCancelled === true;
    const canToggle = isAdmin() && Boolean(callbacks.getRequestId()) && !isArchived();
    const statusLabel = checked ? "Cancelado" : "Pendente";
    const metadata =
      checked && item.crmCancelledAt
        ? `<small class="crm-status-meta">${escapeHtml(item.crmCancelledByName || "Administrador")} · ${escapeHtml(formatDateTime(item.crmCancelledAt))}</small>`
        : "";

    if (!canToggle) {
      return `<span class="crm-status-badge ${checked ? "complete" : "pending"}">${checked ? "✓" : "○"} ${statusLabel}</span>${metadata}`;
    }

    return `
      <label class="crm-status-control ${checked ? "checked" : ""}">
        <input class="crm-cancellation-checkbox" type="checkbox" data-index="${index}" ${checked ? "checked" : ""}>
        <span>${checked ? "✓ Cancelado" : "Marcar como cancelado"}</span>
      </label>
      ${metadata}`;
  }

  function itemHtml(item, index, editable) {
    return `
      <tr class="cancellation-list-row ${item.crmCancelled === true ? "crm-cancelled" : ""}" data-cancellation-index="${index}">
        <td class="cancellation-row-number" data-label="#">${index + 1}</td>
        <td data-label="CPF/CNPJ"><strong>${escapeHtml(item.clientCnpj || "—")}</strong></td>
        <td data-label="Razão Social"><strong>${escapeHtml(item.clientName || "—")}</strong></td>
        <td class="cancellation-row-reason" data-label="Motivo">${escapeHtml(item.reason || "—")}</td>
        <td class="cancellation-row-crm" data-label="Cancelado no CRM">${crmStatusHtml(item, index)}</td>
        ${editable ? `<td class="cancellation-row-action" data-label="Ação"><button class="remove-cancellation-item" type="button" data-index="${index}" aria-label="Remover cliente ${index + 1}">✕ Remover</button></td>` : ""}
      </tr>`;
  }

  function updateCount() {
    const total = state.modalCancellationItems.length;
    listCount.textContent = `${total} ${total === 1 ? "cliente" : "clientes"}`;
  }

  function normalizeItems(items) {
    return (Array.isArray(items) ? items : []).slice(0, maxItems).map((item, index) => ({
      itemId: sanitizeText(item.itemId || `legacy-${index}`),
      clientName: sanitizeText(item.clientName || ""),
      clientCnpj: sanitizeText(item.clientCnpj || ""),
      reason: sanitizeText(item.reason || ""),
      crmCancelled: item.crmCancelled === true,
      crmCancelledAt: item.crmCancelledAt || null,
      crmCancelledByUid: sanitizeText(item.crmCancelledByUid || ""),
      crmCancelledByName: sanitizeText(item.crmCancelledByName || "")
    }));
  }

  function render(items = state.modalCancellationItems, editable = state.modalEditable) {
    state.modalCancellationItems = normalizeItems(items);

    if (!state.modalCancellationItems.length) {
      list.innerHTML = `
        <div class="cancellation-empty-state">
          <strong>A lista está vazia.</strong>
          <span>Preencha os três campos fixos acima e clique em “Adicionar cliente à lista”.</span>
        </div>`;
    } else {
      list.innerHTML = `
        <div class="cancellation-table-wrap">
          <table class="cancellation-table">
            <thead>
              <tr>
                <th>#</th>
                <th>CPF/CNPJ</th>
                <th>Razão Social</th>
                <th>Motivo</th>
                <th>Cancelado no CRM</th>
                ${editable ? "<th>Ação</th>" : ""}
              </tr>
            </thead>
            <tbody>
              ${state.modalCancellationItems.map((item, index) => itemHtml(item, index, editable)).join("")}
            </tbody>
          </table>
        </div>`;
    }

    list.querySelectorAll(".crm-cancellation-checkbox").forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        const index = Number(checkbox.dataset.index);
        if (Number.isNaN(index)) return;
        callbacks.onToggleCrmStatus(index, checkbox.checked, checkbox);
      });
    });

    list.querySelectorAll(".remove-cancellation-item").forEach((button) => {
      button.addEventListener("click", () => {
        const index = Number(button.dataset.index);
        if (Number.isNaN(index)) return;
        state.modalCancellationItems.splice(index, 1);
        render(state.modalCancellationItems, state.modalEditable);
      });
    });

    entry.hidden = !editable;
    addButton.disabled = !editable || state.modalCancellationItems.length >= maxItems;
    updateCount();
  }

  function getItems() {
    return state.modalCancellationItems.map((item) => ({ ...item }));
  }

  function setItems(items, editable = state.modalEditable) {
    render(items, editable);
  }

  function getDraft() {
    return {
      itemId: createItemId(),
      clientCnpj: sanitizeText(cnpjInput.value),
      clientName: sanitizeText(clientNameInput.value),
      reason: sanitizeText(reasonInput.value),
      crmCancelled: false,
      crmCancelledAt: null,
      crmCancelledByUid: "",
      crmCancelledByName: ""
    };
  }

  function clearDraft() {
    cnpjInput.value = "";
    cnpjInput.setCustomValidity("");
    cnpjInput.classList.remove("input-invalid", "input-valid");
    cnpjInput.setAttribute("aria-invalid", "false");
    const messageElement = document.getElementById(cnpjInput.dataset.validationMessage);
    if (messageElement) {
      messageElement.textContent = "";
      messageElement.hidden = true;
    }
    clientNameInput.value = "";
    reasonInput.value = "";
  }

  function addItem() {
    if (!state.modalEditable) return;
    showFormError(requestError);

    if (state.modalCancellationItems.length >= maxItems) {
      showToast(`É possível adicionar até ${maxItems} clientes por solicitação.`, "warning");
      return;
    }

    const draft = getDraft();
    if ((!draft.clientCnpj && !draft.clientName) || !draft.reason) {
      showFormError(
        requestError,
        "Informe o CPF/CNPJ ou a Razão Social e preencha o Motivo antes de adicionar o cliente à lista."
      );
      if (!draft.clientCnpj && !draft.clientName) cnpjInput.focus();
      else reasonInput.focus();
      return;
    }

    if (draft.clientCnpj && !setDocumentValidity(cnpjInput, { required: false, showMessage: true })) {
      showFormError(requestError, "O CPF/CNPJ informado não é válido.");
      cnpjInput.focus();
      return;
    }

    draft.clientCnpj = draft.clientCnpj ? formatCpfCnpj(draft.clientCnpj) : "";
    state.modalCancellationItems.push(draft);
    render(state.modalCancellationItems, true);
    clearDraft();
    cnpjInput.focus();
    showToast("Cliente adicionado. Os campos foram limpos para o próximo cadastro.");
  }

  function setActive(active, editable) {
    section.hidden = !active;
    setSectionInputsEnabled(section, active && editable);
    if (active) render(state.modalCancellationItems, editable);
  }

  function reset() {
    state.modalCancellationItems = [];
    clearDraft();
    render([], true);
  }

  function populate(items, editable) {
    render(items, editable);
  }

  function buildPayload() {
    const draft = getDraft();
    const hasDraftContent = draft.clientName || draft.clientCnpj || draft.reason;
    if (hasDraftContent) {
      return {
        error: "Há dados preenchidos que ainda não foram adicionados. Clique em Adicionar à lista antes de salvar."
      };
    }

    const cancellationItems = getItems().map((item) => ({
      itemId: item.itemId || createItemId(),
      clientName: item.clientName || "",
      clientCnpj: item.clientCnpj || "",
      reason: item.reason || ""
    }));
    if (!cancellationItems.length) {
      return { error: "Adicione pelo menos um cliente para cancelamento." };
    }

    const incompleteIndex = cancellationItems.findIndex(
      (item) => (!item.clientName && !item.clientCnpj) || !item.reason
    );
    if (incompleteIndex >= 0) {
      return {
        error: `Informe CPF/CNPJ ou Razão Social e o Motivo do cliente ${incompleteIndex + 1}.`
      };
    }

    const invalidDocumentIndex = cancellationItems.findIndex(
      (item) => item.clientCnpj && !helpers.isValidCpfCnpj(item.clientCnpj)
    );
    if (invalidDocumentIndex >= 0) {
      return {
        error: `O CPF/CNPJ do cliente ${invalidDocumentIndex + 1} é inválido.`
      };
    }

    cancellationItems.forEach((item) => {
      item.clientCnpj = item.clientCnpj ? formatCpfCnpj(item.clientCnpj) : "";
    });

    const first = cancellationItems[0];
    const firstIdentifier = first.clientName || first.clientCnpj;
    const title =
      cancellationItems.length === 1
        ? `Cancelamento — ${firstIdentifier}`
        : `Cancelamentos — ${cancellationItems.length} clientes`;
    const description = cancellationItems
      .map((item, index) => `${index + 1}. ${item.clientName || item.clientCnpj}: ${item.reason}`)
      .join("\n")
      .slice(0, 3000);

    return {
      data: {
        priority: "normal",
        clientName: first.clientName || first.clientCnpj,
        clientCode: first.clientCnpj,
        title: title.slice(0, 140),
        description: description || "Solicitação de cancelamento.",
        contactName: "",
        contactRole: "",
        contactEmail: "",
        contactPhone: "",
        currentBehavior: "",
        expectedBehavior: "",
        justification: "",
        videoLink: "",
        externalLink: "",
        cancellationItems
      }
    };
  }

  function focus() {
    cnpjInput.focus();
  }

  function bindEvents() {
    addButton.addEventListener("click", addItem);
  }

  return {
    type: "cancelamento",
    setActive,
    reset,
    populate,
    buildPayload,
    focus,
    bindEvents,
    render,
    getItems,
    setItems,
    clearDraft,
    addItem
  };
}

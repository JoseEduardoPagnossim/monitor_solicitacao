import { createCancellationRequestForm } from "./cancellation-form.js";
import { createCustomProjectRequestForm } from "./custom-project-form.js";
import { createProgrammingRequestForm } from "./programming-form.js";
import { createTefElginRequestForm } from "./tef-elgin-form.js";

export function createRequestFormRegistry({ elements, state, helpers, callbacks, maxCancellationItems }) {
  const programming = createProgrammingRequestForm({
    elements: elements.programming,
    helpers
  });
  const cancellation = createCancellationRequestForm({
    elements: elements.cancellation,
    state,
    helpers,
    callbacks,
    maxItems: maxCancellationItems
  });
  const tefElgin = createTefElginRequestForm({
    elements: elements.tefElgin,
    helpers
  });
  const custom = createCustomProjectRequestForm({
    elements: elements.custom,
    helpers
  });

  const forms = {
    programacao: programming,
    cancelamento: cancellation,
    tef_elgin: tefElgin,
    custom
  };

  function typeForProject(project) {
    const type = helpers.projectLegacyType(project);
    return forms[type] ? type : "custom";
  }

  function activate({ project, item = null, editable, existingRequest, archived }) {
    const type = typeForProject(project);
    elements.requestDialog.classList.toggle("request-dialog-cancellation", type === "cancelamento");

    Object.entries(forms).forEach(([formType, form]) => {
      form.setActive(formType === type, editable);
    });

    elements.priorityField.hidden = type !== "programacao";
    elements.requestPriority.disabled = type !== "programacao" || !editable;
    elements.requestSquad.disabled = !editable || (!helpers.isAdmin() && helpers.isSolicitante());

    if (item) {
      if (type === "cancelamento") {
        cancellation.populate(callbacks.cancellationItemsFromRequest(item), editable);
      } else if (type === "custom") {
        custom.render(project, item, editable);
      } else {
        forms[type].populate(item);
      }
    } else if (type === "custom") {
      custom.render(project, null, editable);
    }

    if (type === "tef_elgin") tefElgin.updatePixFields();

    elements.requestType.disabled = !editable || existingRequest;
    elements.requestType.title = existingRequest
      ? "O projeto da solicitação não pode ser alterado após o primeiro salvamento."
      : "";
    elements.requestStatus.disabled = !helpers.isAdmin() || archived;
    elements.requestAssignee.disabled = !helpers.isAdmin() || archived;

    return type;
  }

  function reset() {
    Object.values(forms).forEach((form) => form.reset());
  }

  function buildPayload(project) {
    const type = typeForProject(project);
    return forms[type].buildPayload(project);
  }

  function focus(project) {
    forms[typeForProject(project)].focus();
  }

  function bindEvents() {
    cancellation.bindEvents();
    tefElgin.bindEvents();
  }

  return {
    activate,
    reset,
    buildPayload,
    focus,
    bindEvents,
    typeForProject,
    forms,
    programming,
    cancellation,
    tefElgin,
    custom
  };
}

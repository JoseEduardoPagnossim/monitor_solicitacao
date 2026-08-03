export function setSectionInputsEnabled(section, enabled) {
  if (!section) return;
  section.querySelectorAll("input, textarea, select, button").forEach((control) => {
    if (control.classList.contains("remove-cancellation-item")) return;
    control.disabled = !enabled;
  });
}

export function dynamicInputId(prefix, key) {
  return `${prefix}-${String(key || "field").replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

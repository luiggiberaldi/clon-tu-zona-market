# Reglas del agente — tuzonamarket

## Estilo de interfaz

1. **Dropdowns con bordes redondeados (obligatorio).** No se permiten dropdowns
   cuadrados ni con esquinas apenas redondeadas. Todo elemento desplegable de
   selección — botón cerrado y lista de opciones incluidas — debe usar bordes
   claramente redondeados:
   - Usar **siempre** el componente `components/ui/select-dropdown.tsx`
     (`SelectDropdown`); los `<select>` nativos están prohibidos porque su
     lista desplegable no se puede redondear en todos los navegadores
     (`appearance: base-select` requiere Chrome 135+).
   - Tailwind: `rounded-xl` como mínimo en el disparador y la lista.
   - CSS propio: `border-radius: 12px` o más; prohibidos `border-radius: 0`,
     `6px`, y las clases `rounded` (4 px) / `rounded-sm` / `rounded-none`.
   - Al crear un dropdown nuevo, verificarlo visualmente en el navegador
     (lista abierta) y comprobar que el resto siga cumpliendo la regla.
   - Los guiones de `scripts/qa/browser-flows.mjs` interactúan con estos
     dropdowns mediante el rol `combobox`/`option`, no con `selectOption`.

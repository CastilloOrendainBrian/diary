import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import es from "./locales/es.json";

// Spanish is the only language for now. Add files under locales/ and register them here.
void i18n.use(initReactI18next).init({
  resources: { es: { translation: es } },
  lng: "es",
  fallbackLng: "es",
  interpolation: { escapeValue: false },
});

export default i18n;

# Palabra — fiszki 3D

Interaktywna aplikacja do nauki 1000 hiszpańskich słów z tłumaczeniami na angielski.

- Stół z fiszką obracaną w perspektywie 3D, animowaną dłonią i dwoma kupkami.
- Obsługa dotyku, myszki, gestów przesuwania oraz klawiatury.
- Cofanie klasyfikacji, mieszanie, odwracanie kierunku ES ↔ EN i powtórki trudnych słów.
- Postęp zapisywany lokalnie w przeglądarce (bez rejestracji).

Dane: 1000 par przepisanych bez zmiany treści z listy udostępnionej przez użytkownika. Pierwotna lista zawiera powtórzenia i kilka niespójnych tłumaczeń. Aplikacja ich automatycznie nie poprawia.

Technologie: HTML, CSS 3D, JavaScript bez frameworków, JSON.

## Silnik 3D (od 2026-11-19)
Zamiast płaskiej animacji CSS/SVG stół i karty są renderowane w rzeczywistym WebGL przez Three.js. Obrotowa karta jest parą teksturowanych płaszczyzn na geometrycznym podłożu; stosy są wielowarstwowymi siatkami 3D. Ręka jest pobranym modelem GLB z rzeczywistym szkieletem WebXR (kości nadgarstka i palców), z animacją chwytania oraz towarzyszącym rękawem 3D. Ruch kart jest animowany i przestrzenny, ale NIE jest symulacją opartą na silniku ciał sztywnych.
Zależności są lokalne i statyczne, bez dodatkowego backendu. Jeśli WebGL jest niedostępny, pozostaje poprzedni interfejs CSS.
Informacje o autorach i licencjach w ATTRIBUTIONS.md.

# PROJECT NEXUS — notatki techniczne o aplikacji

**Stan przeglądu:** 2026-10-15  
**Cel:** trwały punkt odniesienia do dalszej pracy nad aplikacją: jak jest zbudowana, co faktycznie robi, co jest zepsute i co warto zrobić dalej.  
**Zakres tej rundy:** mapa repozytorium i głównych przepływów UI/backendu, odczyt kluczowych modułów, uruchomienie `npm test`, `npm run check` i `npm run build`. Nie jest to pełny audyt wszystkich komponentów ani audyt bezpieczeństwa.

> **Ważne:** sekcje 5–8 zachowują wyniki przeglądu początkowego (przed poprawkami opisanymi w sekcji 9). Nie są aktualną listą otwartych bugów. To nie jest pełny audyt wszystkich komponentów ani gwarancja braku innych błędów.

## 1. Czym jest aplikacja

PROJECT NEXUS to lokalna aplikacja Windows do skanowania, indeksowania, klasyfikowania i organizowania plików. Łączy:

- interfejs React + TypeScript uruchamiany przez Vite;
- lokalny serwer Node/Express na `127.0.0.1:3001`;
- strumień zdarzeń WebSocket (`/ws`) dla postępu skanowania i aktualizacji plików;
- moduły analizy plików, wyszukiwania, planowania organizacji i ochrony;
- opcjonalną integrację z lokalnym Ollama oraz konfigurowalnym dostawcą AI.

Główne użycie: użytkownik wybiera katalog/dyski lub katalog przez File System Access API, serwer skanuje pliki i przesyła porcje do interfejsu. UI pokazuje wyniki, kategorie, widoki robocze, szczegóły, wyszukiwanie i akcje na plikach.

## 2. Uruchamianie i konfiguracja

- `npm run dev` uruchamia równolegle `node server/server.cjs` i Vite.
- `npm run server` uruchamia sam backend; `npm run client` sam frontend.
- Backend nasłuchuje na `127.0.0.1:3001`; Vite domyślnie na porcie `5173`, proxy kieruje `/api` i `/ws` do backendu.
- `START_APP.bat` uruchamia środowisko developerskie i otwiera `http://localhost:5173`.
- `launch_silent.vbs` próbuje uruchomić w tle Node i Vite, czeka stałe 1,5 s i otwiera Edge w trybie aplikacji.
- `INSTALL_APP.bat` deleguje do `server/install/nexus_installer.bat`.
- Frontendowy gate logowania w `src/App.tsx` kontroluje widoki aplikacji, ale nie należy utożsamiać go z autoryzacją żądań backendu.

Główne manifesty i konfiguracja: [package.json](./package.json), [vite.config.ts](./vite.config.ts), [tsconfig.json](./tsconfig.json), [START_APP.bat](./START_APP.bat).

## 3. Mapa kodu

### Frontend

- [src/main.tsx](./src/main.tsx) montuje React `StrictMode` i główny komponent.
- [src/App.tsx](./src/App.tsx) jest orkiestratorem: przechowuje etap aplikacji, użytkownika, wyniki, ścieżkę, postęp, workspace’y, blueprint, modale i połączenie WebSocket.
- [src/components/ConnectView.tsx](./src/components/ConnectView.tsx) obsługuje wybór pojedynczego katalogu, całego komputera i wielu workspace’ów; ma także ścieżkę File System Access API.
- [src/components/AnalyzingView.tsx](./src/components/AnalyzingView.tsx) pokazuje postęp skanowania.
- [src/components/NexusDashboardHub.tsx](./src/components/NexusDashboardHub.tsx) jest głównym hubem do filtrowania, przeglądania i uruchamiania narzędzi/modali.
- Pozostałe widoki i funkcje są rozdzielone na komponenty w `src/components/`, m.in. galerie, kanban, triage, workspace’y, podgląd plików, ustawienia, tarczę, edytor kodu i obrazów.
- [src/utils/dynamicCategorizer.ts](./src/utils/dynamicCategorizer.ts), [src/utils/fileSystemAccessManager.ts](./src/utils/fileSystemAccessManager.ts) i [src/utils/nexusAuth.ts](./src/utils/nexusAuth.ts) zawierają odpowiednio klasyfikację UI, obsługę browserowego dostępu do plików i klienta auth.
- [src/types.ts](./src/types.ts) zawiera typy kontraktów frontendowych.

### Backend

- [server/server.cjs](./server/server.cjs) jest głównym serwerem HTTP/WebSocket i routerem API. Obsługuje system info/cache, skanowanie, podgląd plików, wyszukiwanie, planowanie, akcje plikowe, tarczę, AI i auth.
- [server/scanner.cjs](./server/scanner.cjs) jest cienkim eksportem `MasterNexusScanner` z [server/scanner_master.cjs](./server/scanner_master.cjs).
- [server/scanner_master.cjs](./server/scanner_master.cjs) klasyfikuje pliki, analizuje typy binarne i media, agreguje wyniki i współpracuje z klasteryzacją/plannerem.
- [server/planner.cjs](./server/planner.cjs) generuje blueprinty, wykonuje przenoszenie plików i zapisuje dziennik rollbacku.
- Inne główne moduły: [server/search/progressive_filter.cjs](./server/search/progressive_filter.cjs), [server/shield/smart_shield.cjs](./server/shield/smart_shield.cjs), [server/ai/agent_engine.cjs](./server/ai/agent_engine.cjs), [server/auth/auth_vault.cjs](./server/auth/auth_vault.cjs), `server/integrations/`, `server/media/`, `server/code/`, `server/performance/`.
- [server/storage/local_index.cjs](./server/storage/local_index.cjs) implementuje indeks w pamięci oraz zapis/odczyt snapshotu; w przeszukanym backendzie nie znalazłem jego importu/użycia. Obecny cache API w `server.cjs` operuje na `cachedResults`.
- [server/test/test_suite.cjs](./server/test/test_suite.cjs) jest własnym runnerem testów logującym wyniki i kończącym proces kodem błędu przy niepowodzeniu.

## 4. Główne przepływy danych

1. `App` pobiera `/api/system-info`, sprawdza sesję auth i pobiera `/api/cache/items`.
2. `App` łączy się z `/ws`. Zdarzenia `scan:batch`, `scan:progress`, `scan:complete`, `scan:error` i `action:*` aktualizują stan UI.
3. `ConnectView` wywołuje `onStartScan`; `App` czyści dotychczasowe wyniki i POSTuje `/api/scan`.
4. Serwer resetuje `cachedResults`, tworzy `NexusScanner` i przesyła postęp/wyniki przez WebSocket. Skanowanie jest asynchroniczne względem odpowiedzi HTTP.
5. UI przekazuje wyniki do dashboardu i wyspecjalizowanych komponentów; akcje plikowe i organizacyjne idą przez API.
6. Planner zapisuje journale w katalogu `~/.nexus_journals`; sam cache skanowania jest aktualnie stanem procesu i nie jest odtwarzany po restarcie.

Ważne punkty implementacji: [stan i pobieranie cache](./src/App.tsx#L48), [obsługa WebSocket](./src/App.tsx#L103), [start skanowania](./src/App.tsx#L181), [trasa skanowania](./server/server.cjs#L162).

## 5. Problemy w stanie początkowym — priorytety

| Priorytet | Problem | Dowód i wpływ |
|---|---|---|
| **P0 — naprawić przed wydaniem** | `npm run check` nie przechodzi. `ProjectInspection` nie deklaruje pól `fileCount` i `detectedTypes`, choć dwa obiekty je ustawiają; JSX odwołuje się do niezadeklarowanego `isScanning` w dwóch miejscach. | [ConnectView.tsx](./src/components/ConnectView.tsx#L56), [konstruowanie obiektów](./src/components/ConnectView.tsx#L257), [przyciski skanowania](./src/components/ConnectView.tsx#L1391). Bieżący check zgłosił 4 błędy TS (2x TS2353 i 2x TS2304). Produkcyjny `vite build` mimo tego przechodzi, bo nie zastępuje pełnego type-checka. |
| **P0 — ryzyko utraty danych** | Planner ma poprawne mapowania tylko dla `plan-screenshot-triage` i `plan-installers-debloat`. Każdy inny `planId` — w tym plany workspace’ów i mediów generowane przez `generateBlueprint`, a także nieznany identyfikator — trafia do gałęzi `else`, która wybiera pierwszych 100 elementów i przenosi je do `_Nexus_Katalog`. Endpoint wykonuje plan na podstawie przekazanego `planId`. | [planner.cjs](./server/planner.cjs#L131), [fallback przenoszący 100 elementów](./server/planner.cjs#L141), [endpoint execute](./server/server.cjs#L772). Do czasu naprawy należy unikać wykonywania planów innych niż dwa jawnie obsłużone; dry-run także powinien być zweryfikowany dla każdego identyfikatora. |
| **P0 — niebezpieczna operacja na plikach** | `/api/shield/purge-ghost-junk` przyjmuje ścieżki z body i usuwa pliki przez `unlinkSync`/puste katalogi przez `rmdirSync`. W tym handlerze nie ma ograniczenia do wybranego skanowanego katalogu ani ochrony katalogów systemowych; błędy są po cichu pomijane, a odpowiedź ma kształt sukcesu. | [server.cjs](./server/server.cjs#L1378). Wymagane: serwerowo wyliczać kandydatów lub walidować je względem zatwierdzonego root, re-użyć ochrony z akcji usuwania, raportować błędy per ścieżka i dodać testy blokujące ścieżki poza rootem. |
| **P1 — reset hasła nie odpowiada komunikatowi UI/API** | Kod odzyskiwania powstaje przez `Math.random()` i trafia do lokalnego `nexus_reset_codes.json`; w odczytanym przepływie nie ma wysyłki e-maila, mimo komunikatu „Sprawdź swoją pocztę”. Dodatkowo poprawny kod dla adresu bez konta tworzy nowy rekord użytkownika, zamiast odrzucić reset; dla istniejącego konta istniejące sesje nie są unieważniane. | [auth_vault.cjs](./server/auth/auth_vault.cjs#L320), [kod i komunikat](./server/auth/auth_vault.cjs#L325), [tworzenie nieistniejącego użytkownika](./server/auth/auth_vault.cjs#L368). Trzeba zdecydować: prawdziwy, weryfikowalny proces e-mail z limiterem/bezpiecznym kodem albo usunięcie obietnicy „reset e-mailem” i używanie wyłącznie faktycznie dostępnej metody odzyskiwania. |
| **P1 — dublująca się trasa API** | `POST /api/action/open-in-explorer` jest zarejestrowany dwa razy. Pierwszy handler odpowiada bez `next()`, więc drugi handler nie obsługuje normalnego żądania do tej ścieżki; zachowania obu handlerów różnią się. | [pierwszy handler](./server/server.cjs#L924), [drugi handler](./server/server.cjs#L1262). Zostawić jeden, przenieść potrzebne walidacje do niego i dodać test kontraktu. |
| **P1 — dane auth/runtime mogą trafić do Git** | `.gitignore` wyklucza `node_modules`, `dist`, `.scannerwork`, `.quarantine_vault` i logi, ale nie wyklucza plików runtime w `server/storage/`, w tym vaulta użytkowników i ewentualnych kodów odzyskiwania. W repozytorium bez wcześniejszych commitów `server/` jest obecnie nieśledzonym katalogiem, więc przypadkowe `git add .` może dodać te dane. Nie odczytywałem zawartości vaulta. | [.gitignore](./.gitignore), [ścieżka bazy użytkowników](./server/auth/auth_vault.cjs#L6). Dodać do ignorowanych plików runtime i rozdzielić przykładowe, bezpieczne ustawienia od lokalnych danych użytkownika. Przed pierwszym commitem sprawdzić staging. |
| **P2 — deklaracja „100% lokalnie” jest nieścisła** | `index.html` pobiera fonty Inter i JetBrains Mono z Google Fonts. To zewnętrzne żądania sieciowe, choć logika analizy może działać lokalnie. | [index.html](./index.html#L9). Samo self-hostowanie fontów lub systemowe fallbacki usuną tę konkretną zależność; dokumentacja prywatności powinna wymieniać pozostałe połączenia (np. skonfigurowane API AI/VT) zgodnie z faktycznym użyciem. |
| **P2 — błędy po stronie klienta są w części ukrywane** | Nieudane pobranie cache w `App` kończy się pustym `.catch(() => {})`; część akcji robi `fetch` bez sprawdzania `response.ok` i bez pokazania błędu. Użytkownik może nie wiedzieć, że API odrzuciło operację. | [App.tsx](./src/App.tsx#L71), [przykład akcji](./src/App.tsx#L181). Ujednolicić obsługę odpowiedzi API, pokazywać status/błąd w UI i logować kontekst operacji bez połykania błędów. |

### Dodatkowe ryzyka i niepewności do sprawdzenia

- Sekret HMAC ma wartość fallback wpisaną w kodzie, gdy brak `NEXUS_MASTER_SECRET`. To nie jest tajny sekret per instalacja; przed poleganiem na podpisie pliku `.searched` trzeba wymusić sekretną, stabilną konfigurację albo zastosować odpowiedni projekt lokalnego klucza. [auth_vault.cjs](./server/auth/auth_vault.cjs#L8)
- Endpointy operujące na plikach są dostępne w lokalnym serwerze. Gate logowania w UI nie jest middleware auth dla Express; trzeba świadomie ustalić granicę zaufania aplikacji desktopowej i zabezpieczyć wrażliwe endpointy, walidację ścieżek oraz CSRF/pochodzenie żądań adekwatnie do tej granicy.
- `launch_silent.vbs` używa stałego opóźnienia zamiast sprawdzenia gotowości backendu/Vite. Na wolnym starcie może otworzyć UI przed gotowością usług; wielokrotne wywołanie może też uruchomić kolejne procesy. [launch_silent.vbs](./launch_silent.vbs)
- Komentarze/progress report deklarują persystencję indeksu i rozbudowaną weryfikację, ale aktywny API cache w głównym serwerze przechowuje wyniki w `cachedResults`; znaleziony `LocalIndex` nie jest używany przez `server.cjs`. Trzeba zdecydować, czy snapshot ma być częścią produktu, i zaktualizować dokumentację po wdrożeniu lub korekcie deklaracji. [local_index.cjs](./server/storage/local_index.cjs), [cache w server.cjs](./server/server.cjs#L46)

## 6. Propozycje z przeglądu początkowego

### Najpierw bezpieczeństwo operacji i poprawność

1. **Naprawić TypeScript**: zaktualizować typ `ProjectInspection` zgodnie z faktycznym kontraktem i usunąć albo poprawnie zdefiniować `isScanning`; potem uruchomić `npm run check`.
2. **Planner jako allowlista**: jawny handler dla każdego ID z blueprintu, odrzucenie nieznanych ID `400`, żadnego fallbacku przenoszącego arbitralne elementy. Testować wszystkie plany: dry-run, wykonanie na tempdir, kolizje nazw, brak źródła, rollback i częściowe błędy.
3. **Bezpieczne czyszczenie**: endpoint purge powinien akceptować identyfikatory/ścieżki wygenerowane przez serwer, ograniczać zakres do wybranego katalogu, odmawiać katalogów systemowych i zwracać wynik każdej operacji.
4. **Naprawić reset konta** i ograniczyć sesje: nie udawać wysyłki e-maila; nie tworzyć konta przez reset; bezpieczny generator i limiter prób; unieważniać istniejące tokeny po resecie.
5. **Walidacja tras i ścieżek**: wspólny helper rozwiązywania/normalizacji ścieżek oraz jawne zasady dla Windows, symlinków, ścieżek spoza zeskanowanego root i operacji destrukcyjnych.

### Stabilność i testowalność

- Dodać testy jednostkowe do kontraktu AuthVault (w odizolowanym katalogu tymczasowym) oraz testy endpointów Express dla walidacji, błędów i uprawnień.
- Dodać regresje na plan IDs i purge-ghost-junk; testy mają mierzyć, że pliki spoza root nie są modyfikowane.
- Dodać jeden test integracyjny: start skanowania → WebSocket batch/progress/complete → cache → akcja plikowa.
- Ujednolicić format błędów API i obsługę `response.ok` po stronie React; wyświetlać stan „brak danych” odróżniony od „backend nie działa”.
- Zastąpić stałe opóźnienie w launcherze sprawdzaniem gotowości portów/usług, z limitem czasu i czytelnym komunikatem błędu.
- Podjąć decyzję o persistencji indeksu. Jeśli zostaje wyłącznie cache RAM, poprawić nazwy i dokumentację, żeby nie obiecywały odtwarzania indeksu.

### UX, wydajność i utrzymanie

- Dodać status backendu i AI, szczególnie stan Ollama (offline, brak modelu, błąd połączenia), bez cichych pustych ekranów.
- Umożliwić anulowanie/zatrzymanie skanowania z potwierdzonym stanem zakończenia i odpornością UI na spóźnione wiadomości WebSocket.
- Rozważyć wirtualizację długich list i ograniczenie duplikowania dużych tablic w stanie React przy skanowaniu dużych drzew.
- Rozdzielić `NexusDashboardHub` na mniejsze komponenty/warstwy danych, gdy będą modyfikowane konkretne funkcje; nie robić refaktoru bez testów zachowania.
- Samohostować fonty, jeśli produkt ma być offline/privacy-first, i opisać połączenia wykonywane przez zewnętrznych dostawców (AI/VirusTotal) zamiast deklarować bezwarunkowe „zero external data”.
- Dodać brakujące konwencje repo: opis instalacji/uruchamiania, wymagania Node, tryb offline, katalogi runtime, backup danych, ograniczenia OS i znane ryzyka. Obecny `PROJECT_OVERDRIVE_PROGRESS.md` jest trackerem deklarowanych etapów, nie wiarygodnym zastępstwem README ani bieżącego statusu.

## 7. Weryfikacja bazowa przed poprawkami

| Polecenie | Wynik |
|---|---|
| `npm test` | **PASS — 22/22 testów** w `server/test/test_suite.cjs`. Pokrywają m.in. heurystyki Smart Shield, wyszukiwanie, indeksator składni, pamięć, planner dry-run, integracje hasha/SQLite/Ollama/VirusTotal i podstawowe funkcje agenta AI. |
| `npm run check` | **FAIL — 4 błędy TypeScript** w `src/components/ConnectView.tsx` (opisane w problemach P0). |
| `npm run build` | **PASS** — Vite zbudował frontend. Build nie jest wystarczającą kontrolą typów, co potwierdza osobny nieudany check. |

Wyniki testów z tej rundy są aktualniejsze niż sekcja „Verified Test Suite Results” w [PROJECT_OVERDRIVE_PROGRESS.md](./PROJECT_OVERDRIVE_PROGRESS.md), która podaje 17/17. Ten sam plik deklaruje przechodzący TypeScript, co jest sprzeczne z bieżącym wynikiem. Wnioski z tabeli wyżej wynikają z odczytanego kodu i bieżących poleceń, nie z historycznych deklaracji.

## 8. Kolejność prac zaproponowana przed implementacją

1. Naprawić i sprawdzić TypeScript.
2. Zablokować niejawny fallback planera i dodać testy wszystkich planów.
3. Zabezpieczyć purge-ghost-junk i dodać testy ścieżek poza rootem.
4. Uporządkować reset hasła, sesje i sekret HMAC.
5. Usunąć duplikat trasy, dodać testy HTTP oraz ujednolicić obsługę błędów.
6. Zaktualizować README/status projektu po potwierdzeniu realnych zachowań, nie przed.

## 9. Stan po implementacji poprawek

### Wykonane

- Naprawiono cztery wcześniejsze błędy TypeScript w `ConnectView`; widok diagnostyczny IDE nie zgłasza obecnie błędów w sprawdzonych komponentach.
- Planner dopuszcza wyłącznie jawnie obsługiwane plany. Nieznane ID i plany informacyjne są odrzucane; kopie instalatorów są wybierane po ścieżkach potwierdzonych przez analizę duplikatów, a nie po samym wzorcu nazwy.
- Dziennik planera zapisuje stan transakcji przed/po przeniesieniach. Symulacja podaje poprawną liczbę elementów, rollback raportuje nieprzywrócone pliki i zapisuje stan cofania.
- Ghost Cleaner ogranicza operacje do aktualnie wykrytych kandydatów w aktywnych rootach. Interfejs odświeża listę po częściowym sukcesie i rozróżnia pliki skierowane do Kosza od pustych katalogów.
- Integracja Kosza nie usuwa już plików trwale w przypadku awarii PowerShell ani na nieobsługiwanych systemach. Ścieżki nie są interpolowane w poleceniach shell; otwieranie plików korzysta z `execFile`.
- Poprawiono obsługę błędów w triage/deduplikacji oraz przy odpowiedziach API; aktualizacja UI następuje po potwierdzonym sukcesie serwera.
- Auth używa sekretu per instalacja zamiast stałego sekretu w kodzie, PBKDF2 z 310 000 iteracjami dla nowych haseł i migracji przy logowaniu, timing-safe porównań oraz unieważniania sesji po resecie kluczem `.searched`.
- Usunięto pozorny reset e-mail (kod nie był wysyłany pocztą), duplikaty tras walidacji/otwierania, zewnętrzny download fontów oraz fikcyjne wartości postępu. Dane auth/runtime są ignorowane przez Git, Vite nasłuchuje na loopback.
- Rozszerzono własny runner o regresje dla nieobsługiwanych planów, symulacji, dokładnego wyboru plików instalatorów, brakujących plików, błędów rollbacku i migracji hashy AuthVault.

### Ograniczenia nadal otwarte

- Fizyczne przenoszenie obsługuje wyłącznie zrzuty ekranu i duplikaty instalatorów wykryte przez klasteryzację. Workspace’y i katalog mediów pozostają planami informacyjnymi.
- Przenoszenie do archiwum nie odzyskuje miejsca na dysku; blueprint nie obiecuje już odzyskania przestrzeni przez te plany.
- Cache skanowania jest nadal ulotnym stanem procesu. `LocalIndex` nie jest podłączony, więc indeks nie odtwarza się po restarcie.
- Pliki `.searched` podpisane poprzednim, wbudowanym sekretem nie będą działały z nowym sekretem losowym per instalacja. Zgodność jest możliwa wyłącznie po jawnym skonfigurowaniu dawnej wartości jako `NEXUS_MASTER_SECRET`, jeśli jest dostępna; nie należy przywracać słabego fallbacku w kodzie.
- UI wymusza logowanie, ale API Express nadal nie ma ogólnego middleware auth. Granica zaufania lokalnego serwera i ochrona wrażliwych endpointów wymagają osobnej decyzji.
- `launch_silent.vbs` nadal czeka stałe 1,5 sekundy, zamiast sprawdzać gotowość usług. Nie dodano testów HTTP dla tras Express.

### Walidacja po zmianach

- Diagnostyka IDE (`problems`) nie zgłasza błędów dla sprawdzonych plików TypeScript.
- Narzędzie uruchamiania testów IDE nie rozpoznało `server/test/test_suite.cjs`, ponieważ to własny runner Node, nie plik testowy frameworka. Po zmianach nie uruchomiono `npm test`, `npm run check` ani `npm run build`; wyniki z sekcji 7 są wyłącznie bazowe i nie walidują aktualnego stanu.

## 10. Usprawnienia dashboardu

W ramach mini-rebuild zachowano dotychczasowy ciemny styl i przepływy dashboardu, skupiając zmiany na `NexusDashboardHub`, wspólnym CSS i podsumowaniu indeksu:

- Dodano responsywne menu boczne z przyciskiem mobilnym, warstwą zamykającą, zamykaniem klawiszem Escape i obsługą Enter/Spacji dla pozycji nawigacyjnych. Zamknięte menu mobilne jest ukryte także przed nawigacją klawiaturą.
- Dodano karty podsumowujące indeks: liczbę plików, sumę ich rozmiarów, liczbę zrzutów ekranu oraz przypięte pliki. Interaktywne karty prowadzą do odpowiedniego filtra lub resetują filtry.
- Status Ollama i nazwa modelu bazują na odpowiedzi `/api/ai/status`; usunięto etykiety sugerujące niepotwierdzoną synchronizację lub aktywność ochrony. Rozmiar indeksu nie jest przedstawiany jako użycie dysku systemowego.
- Żądania statusu AI i wyszukiwania kierowanego są anulowane przy odmontowaniu lub zmianie parametrów. Błędy nie są już po cichu ignorowane; są raportowane w konsoli, bez aktualizowania stanu odpowiedziami z nieaktualnych żądań.
- Dane przypiętych plików odczytywane z `localStorage` są walidowane jako tablica identyfikatorów tekstowych.
- Globalne style dashboardu uwzględniają mniejsze ekrany, ograniczenie ruchu, interakcje dotykowe i zaznaczanie tekstu.
- `ExecutiveMissionControl` używa opisów odpowiadających dostępnym funkcjom; przycisk planów jest niedostępny, dopóki blueprint nie istnieje.
- Nie edytowano każdego komponentu tylko po to, aby zwiększyć liczbę linii. Zmiany wspólne wykonano w stylach globalnych; pozostałe komponenty warto poprawiać przy konkretnych potrzebach UX.

Walidacja tego etapu: diagnostyka IDE nie zgłasza błędów dla `NexusDashboardHub.tsx`, `ExecutiveMissionControl.tsx`, `App.tsx` ani `index.css`. Nie uruchomiono buildu/testów ani nie przeprowadzono wizualnej kontroli w przeglądarce; pełne sprawdzenie przed wydaniem nadal jest wymagane.

## 11. Audyt dashboardu — poprawki

Przegląd objął `NexusDashboardHub` oraz bezpośrednio używane komponenty wyszukiwania, podglądu, miniaturek i inspektora. Naprawiono:

- synchronizację wybranego pliku z aktualnie przefiltrowanymi wynikami, korektę numeru strony po zawężeniu listy oraz czyszczenie zaznaczeń wsadowych po zmianie indeksu;
- skróty klawiszowe przechwytujące spację/strzałki podczas obsługi przycisków, wyszukiwanie fokusu niewłaściwego pola oraz nawigację klawiaturą i podglądem, która nie przechodziła między stronami;
- odświeżanie kontekstu wyszukiwania kierowanego po zmianie folderu oraz zachowanie zaznaczenia nieudanych pozycji wsadowych, aby można je było ponowić;
- pozostawianie mobilnego menu otwartego po przejściu do widoku tematów oraz zamykanie podglądu spacją przy aktywnym przycisku;
- wysyłanie zwykłego tekstu wyszukiwania jako polecenia AI po Enter;
- fałszywe komunikaty sukcesu dla nieudanych/przerwanych akcji API, brak raportu o częściowych awariach w akcjach wsadowych oraz nieobsłużone błędy schowka;
- efekty uboczne zapisu i powiadomień wykonywane wewnątrz aktualizatorów stanu React dla przypiętych plików; błędy `localStorage` są teraz zgłaszane;
- brak obsługi obrazów wybranych przez File System Access API w miniaturach oraz próby użycia ich w serwerowych akcjach wymagających prawdziwych ścieżek systemowych;
- nieprawdziwe domyślne dane Ollama w inspektorze, a także spóźnione aktualizacje metadanych po zmianie pliku.

Walidacja: diagnostyka IDE nie zgłasza błędów w `NexusDashboardHub.tsx`, `InlineGuidedSearchBar.tsx`, `NexusRightMetadataDrawer.tsx`, `LazyThumbnail.tsx` ani `QuickLookModal.tsx`. Próby uruchomienia `npm run check`, `npm test` i `npm run build` zostały zablokowane przed startem przez środowisko Windows sandbox („Windows sandboxing requires BaseContainer”). Niestandardowy runner testów nie jest obsługiwany przez narzędzie IDE. Testy, build i kontrola wizualna pozostają do wykonania poza tym ograniczeniem; zakres tego audytu nie obejmuje pełnego przeglądu wszystkich modułów aplikacji.

## 12. Utwardzenie PHP API i granice gotowości SaaS

- `public/api/index.php` i `public/api/auth.php` korzystają ze wspólnej konfiguracji w `public/api/security.php`: CORS jest ograniczony do jawnej listy `NEXUS_ALLOWED_ORIGINS` (domyślnie domeny SearchPoint), a odpowiedzi dodają podstawowe nagłówki bezpieczeństwa. Żądania bez nagłówka `Origin` nadal mogą pochodzić od klientów nieprzeglądarkowych; CORS nie jest mechanizmem uwierzytelniania.
- PHP API nie używa już sekretu HMAC wpisanego w kodzie. Wdrożenie musi ustawić `NEXUS_MASTER_SECRET` na losową, tajną wartość o długości co najmniej 64 znaków. Brak konfiguracji powoduje odmowę obsługi API; poprzednie podpisy `.searched` nie są automatycznie migrowane.
- Lokalny Node AuthVault może przechowywać dane poza domyślnym `server/storage` przez `NEXUS_AUTH_DATA_DIR`; zabezpiecz ten katalog kopią zapasową i uprawnieniami systemowymi.
- Dane PHP API są przechowywane poza `DOCUMENT_ROOT`: domyślnie w `nexus_private_storage` obok katalogu `public`, z możliwością wskazania zewnętrznego katalogu przez `NEXUS_DATA_DIR`. Jeśli katalog danych znajdzie się pod web root, endpoint odmawia uruchomienia. Przed wdrożeniem należy przenieść istniejące dane z dotychczasowego `public/storage` do bezpiecznego katalogu poza web root.
- Dodano limitowanie prób logowania, rejestracji i odzyskiwania hasła według adresu IP w pliku runtime z blokadą pliku. Limiter wymaga zapisywalnego katalogu danych PHP API; przy awarii jego zapisu endpoint zwraca błąd zamiast wyłączać limit po cichu. To limiter pojedynczego serwera, nie rozwiązanie rozproszone.
- Node API nasłuchuje wyłącznie na loopback; połączenia WebSocket i CORS są ograniczone do portów localhost dla Vite dev/preview, a parsery body mają limit 10 MB. Chronione trasy API i WebSocket wymagają aktywnej sesji AuthVault. Sesja jest odnawiana jako cookie `HttpOnly; SameSite=Strict`; w HTTPS wdrożenie musi ustawić `NEXUS_COOKIE_SECURE=true`. Jawny origin-check blokuje obce żądania przeglądarkowe.
- Node odrzuca jawnie żądania HTTP z niezatwierdzonym originem, limituje próby logowania/rejestracji/resetu i ogranicza przekazywane ścieżki plików do aktywnego indeksu. Sprawdzenie canonical path obejmuje istniejące symlinki/junctiony i brakujące cele przez najbliższego istniejącego rodzica; operacje delete/quick-move nie mogą wskazywać samego katalogu root. Trasy wyboru katalogu i rozpoczęcia skanowania pozostają celowo nieograniczone przez aktywny indeks, bo ustanawiają go.
- Uwierzytelnienie nie oznacza jeszcze izolacji tenantów: pamięć indeksu, skaner, ustawienia i kwarantanna pozostają współdzielonym stanem procesu. Node należy traktować wyłącznie jako lokalny, jednoużytkownikowy proces, nie wystawiać za publiczny proxy; model SaaS wymaga osobnych workspace'ów/agentów z izolacją danych.
- Treści strony, ConnectView i ustawień AI nie obiecują już bezwarunkowo „100% prywatności”, „zero chmury”, zerowej telemetrii ani twardych benchmarków. Lokalne Ollama i zewnętrzne integracje mają różny przepływ danych; użytkownik powinien weryfikować dostawcę i wysyłany kontekst.
- Te zmiany nie czynią projektu gotowym na SaaS. Indeks i operacje na plikach są lokalnym, współdzielonym stanem jednego procesu/hosta; potrzebne są m.in. właściwa izolacja tenantów i workspace'ów, autoryzacja wszystkich tras, wdrożeniowa polityka sekretów, trwała baza danych i integracyjne testy API.
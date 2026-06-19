/* ============================================================
   CCA-trener · logikk
   ------------------------------------------------------------
   Spørsmålsbank, tilstand + lagring, rendering og eksamensklokke.
   Lastes nederst i index.html — altså ETTER at #app finnes i DOM-en —
   så vi slipper å vente på noen "ready"-hendelse.

   Stilene ligger i cca-trainer.css.

   Merk: det lille anti-flash-temaskriptet ligger fortsatt INLINE i
   <head> i index.html. Det må kjøre før første paint for å unngå at feil
   tema blinker til, og kan derfor ikke vente på at denne fila lastes ned.
   Resten av tema-logikken (selve toggle-knappen) bor her nede.
   ============================================================ */

/* ---------- Domains (weights from a community guide, NOT confirmed by Anthropic) ---------- */
const DOMAINS = [
  {
    id: "d1",
    name: "Agentisk arkitektur & orkestrering",
    short: "Agentisk",
    weight: 27,
    color: "var(--d1)",
    hex: "#B0455D",
  },
  {
    id: "d2",
    name: "Claude Code · konfig & workflows",
    short: "Claude Code",
    weight: 20,
    color: "var(--d2)",
    hex: "#C98A2E",
  },
  {
    id: "d3",
    name: "Prompt engineering & structured output",
    short: "Prompt",
    weight: 20,
    color: "var(--d3)",
    hex: "#5E7F6E",
  },
  {
    id: "d4",
    name: "Tool design & MCP-integrasjon",
    short: "Tool/MCP",
    weight: 18,
    color: "var(--d4)",
    hex: "#4A6B82",
  },
  {
    id: "d5",
    name: "Context management & reliability",
    short: "Context",
    weight: 15,
    color: "var(--d5)",
    hex: "#7A5E8A",
  },
];

/* ---------- Question bank (practice questions, not real exam items) ---------- */
const Q = [
  // D1 — Agentic (10)
  {
    d: "d1",
    q: "En oppgave er avgrenset og deterministisk — samme input gir alltid samme steg. Hva taler for å bruke ett tool-augmentert kall fremfor et multi-agent-system?",
    a: [
      "Et multi-agent-oppsett gir høyere nøyaktighet på enhver oppgave, så det er det tryggeste valget",
      "Orkestrering legger til feiloverflate og latens uten gevinst når oppgaven ikke trenger koordinering",
      "Agenter er billigere per kall, så flere agenter senker totalkostnaden over tid",
      "Et enkeltkall kan ikke bruke verktøy, så en agent er nødvendig for alt utover ren tekst",
    ],
    c: 1,
    e: "Prinsippet er «ikke legg til agenter du ikke trenger». Hvert ekstra ledd i en orkestrering er en ny ting som kan feile og koste tokens/tid. Når oppgaven er avgrenset, vinner det enkleste som løser den.",
  },
  {
    d: "d1",
    q: "En agent-loop står fast og gjentar det samme feilende verktøykallet om og om igjen. Hva er det beste arkitektoniske mottiltaket?",
    a: [
      "Øk max_tokens slik at agenten får mer plass til å tenke seg ut av situasjonen",
      "Fjern verktøyet fra agenten helt, så den ikke kan gjøre det feilende kallet igjen",
      "Sett en iterasjonsgrense og oppdag gjentatte identiske kall, så loopen brytes og eskaleres",
      "Legg til en instruksjon i prompten om at agenten ikke skal gjenta seg selv unødig",
    ],
    c: 2,
    e: "Du må binde loopen og oppdage manglende fremdrift. Maks-iterasjoner + å fange «samme kall igjen» og bryte/eskalere er deterministisk; en prompt-instruksjon alene er det ikke.",
  },
  {
    d: "d1",
    q: "I et orkestrator-/subagent-oppsett gir du hver subagent sin egen, isolerte kontekst. Hva er hovedgrunnen?",
    a: [
      "Det reduserer antallet API-nøkler du trenger fordi hver agent gjenbruker samme økt",
      "Det holder hver agents kontekst fokusert og fri for context-forurensning",
      "Det lar agentene dele minne automatisk så de slipper å sende tilstand mellom seg",
      "Det er et formelt krav i MCP-spesifikasjonen for alle fleragent-systemer",
    ],
    c: 1,
    e: "Fokusert kontekst per agent = mindre støy, færre tokens, mer pålitelige svar. Når alt deler én voksende kontekst, drukner det relevante i det irrelevante.",
  },
  {
    d: "d1",
    q: "Du skal klassifisere 100 000 uavhengige dokumenter. Det haster ikke — resultatet kan komme om noen timer. Hva er mest kostnadseffektivt?",
    a: [
      "Send alle som vanlige sanntidskall samtidig, så blir hele jobben ferdig raskest mulig",
      "Bruk Batch API — asynkron behandling med lavere kostnad når du tåler litt ventetid",
      "Bygg ett stort prompt med alle dokumentene, så slipper du overhead per enkeltkall",
      "Kjør én autonom agent som looper gjennom dokumentene og klassifiserer ett om gangen",
    ],
    c: 1,
    e: "Match arbeidsmengdens form til API-modusen. Batch API bytter latens mot lavere kostnad — perfekt for stort volum av uavhengige oppgaver uten hastekrav. (Sjekk gjeldende rabatt i live-docs.)",
  },
  {
    d: "d1",
    q: "Du designer for «graceful failure» når en agent ikke klarer å fullføre. Hva er beste mønster?",
    a: [
      "La agenten fortsette å prøve på nytt til den til slutt klarer å fullføre oppgaven",
      "La agenten svare som om den lyktes, slik at brukeren ikke merker at noe gikk galt",
      "Definer en eksplisitt fallback-vei eller eskalering, og returner et delvis resultat",
      "Krasj prosessen umiddelbart og start hele kjøringen på nytt fra første steg",
    ],
    c: 2,
    e: "Et pålitelig system vet hva det skal gjøre når det ikke vet. Eksplisitt fallback + strukturert delresultat slår både uendelig prøving og hallusinert «suksess».",
  },
  {
    d: "d1",
    q: "Når griper du til et orkestrator-arbeider-mønster fremfor én autonom agent?",
    a: [
      "Når oppgaven er liten og lineær, så orkestratoren kan styre stegene i fast rekkefølge",
      "Når deloppgavene er heterogene og hver tjener på en spesialisert arbeider eller parallellitet",
      "Alltid — orkestrator-arbeider er det mest moderne mønsteret og bør være standardvalget",
      "Når du vil spare tokens på enkle oppgaver ved å dele dem opp i mindre kall",
    ],
    c: 1,
    e: "Orkestrator-arbeider lønner seg når du har ulike deloppgaver som hver tjener på en spesialisert arbeider, eller som kan kjøres parallelt. For små lineære oppgaver er det overkill.",
  },
  {
    d: "d1",
    q: "En agent kaller verktøy i en loop. Hva hindrer best at kostnaden løper løpsk?",
    a: [
      "Velg en billigere modell til agenten og stol på at kostnaden holder seg lav nok",
      "Sett tak på iterasjoner og et budsjett for token- og verktøykall, med klare stoppbetingelser",
      "Slå av logging under kjøring, siden logging er en stor del av kostnaden ved lange loops",
      "Gi agenten færre verktøy å velge mellom, så gjør den færre kall totalt sett",
    ],
    c: 1,
    e: "Eksplisitte budsjetter og stoppbetingelser er den arkitektoniske bremsen. Uten tak kan en loop teoretisk kalle verktøy i det uendelige.",
  },
  {
    d: "d1",
    q: "En agent produserer av og til en ugyldig handling (feil argumenter). Hvilken sikring er mest robust?",
    a: [
      "Valider verktøy-input og -output mot et schema, og be om nytt forsøk ved valideringsfeil",
      "Stol på rå modell-output siden moderne modeller sjelden produserer ugyldige argumenter",
      "Logg feilen for ettertiden og la agenten fortsette videre uten å rette opp i den",
      "Bytt til en større modell, som er mindre tilbøyelig til å lage ugyldige handlinger",
    ],
    c: 0,
    e: "Guardrails: valider mot schema og re-prompt ved feil. Du behandler modellens output som noe som må verifiseres, ikke som noe du kan stole blindt på.",
  },
  {
    d: "d1",
    q: "Når bør du IKKE bruke en autonom agent?",
    a: [
      "Når oppgaven er kreativ og åpen, fordi agenter takler ikke oppgaver uten fasitsvar",
      "Når du trenger et deterministisk og etterprøvbart resultat hver gang",
      "Når du har mange verktøy tilgjengelig, siden det forvirrer agentens valg av handling",
      "Når brukeren er teknisk og heller vil styre hvert steg i prosessen selv",
    ],
    c: 1,
    e: "Autonomi koster forutsigbarhet. Trenger du samme reviderbare output hver gang (compliance, faste pipelines), gir en deterministisk flyt mer pålitelighet enn en agent som velger fritt.",
  },
  {
    d: "d1",
    q: "Å parallellisere uavhengige deloppgaver over flere agenter forbedrer primært hva?",
    a: [
      "Nøyaktigheten på hvert enkelt svar, fordi agentene kan kontrollere hverandres arbeid",
      "Latens og gjennomstrømning for arbeid som faktisk er uavhengig mellom deloppgavene",
      "Modellens underliggende kunnskap, siden flere agenter dekker flere fagområder",
      "Sikkerheten i systemet, fordi arbeidet spres på flere isolerte prosesser",
    ],
    c: 1,
    e: "Parallellitet gir deg fart/throughput når oppgavene ikke er avhengige av hverandre. Det gjør ikke hvert enkelt svar mer riktig — det gjør bare at du får mange svar raskere.",
  },

  // D2 — Claude Code (7)
  {
    d: "d2",
    q: "Hva er hovedformålet med en CLAUDE.md-fil i et prosjekt?",
    a: [
      "Lagre API-nøkler, tokens og andre hemmeligheter som prosjektet trenger ved oppstart",
      "Gi Claude Code vedvarende prosjektkontekst som lastes inn automatisk ved oppstart",
      "Erstatte prosjektets README slik at sluttbrukere har én fil å forholde seg til",
      "Definere CI/CD-pipelinen som kjører automatisk når koden pushes til hovedgrenen",
    ],
    c: 1,
    e: "CLAUDE.md er det persistente kontekstlaget: hvordan dette prosjektet henger sammen, hvilke konvensjoner og kommandoer som gjelder. Aldri legg hemmeligheter der.",
  },
  {
    d: "d2",
    q: "Et team på 20 jobber på en monorepo. Hvor bør delte konvensjoner ligge kontra personlige preferanser?",
    a: [
      "Alt i hver enkelt utviklers personlige config, så ingen overstyrer andres oppsett",
      "Delte konvensjoner i prosjekt-scopet CLAUDE.md committet til repoet, personlige i bruker-scope",
      "Alt samlet i én global fil på en delt server som hele teamet peker mot",
      "Konvensjoner trenger ikke skrives ned — erfarne utviklere finner mønsteret av seg selv",
    ],
    c: 1,
    e: "Delt og committet = hele teamet får samme kontekst. Bruker-scopet config (f.eks. ~/.claude) holder personlige preferanser private uten å påtvinge dem på andre.",
  },
  {
    d: "d2",
    q: "Hva er hooks i Claude Code til for?",
    a: [
      "Å hjelpe deg å skrive bedre prompts ved å foreslå forbedringer mens du jobber",
      "Å kjøre deterministiske kommandoer automatisk på bestemte livssyklus-hendelser",
      "Å koble Claude Code til internett så den kan hente ned oppdaterte pakker selv",
      "Å lagre samtalehistorikken mellom økter slik at konteksten overlever en omstart",
    ],
    c: 1,
    e: "Hooks er deterministisk automatisering/guardrails knyttet til hendelser. De er kode som kjører garantert — ikke en instruksjon modellen kan velge å ignorere.",
  },
  {
    d: "d2",
    q: "Du vil garantere at ingen redigerer en sensitiv mappe. Beste mekanisme?",
    a: [
      "Skrive tydelig i CLAUDE.md at den mappen ikke skal røres under noen omstendighet",
      "En hook som fanger handlingen og nekter den deterministisk før den får skje",
      "Be Claude eksplisitt om å la mappen være i fred ved starten av hver økt",
      "Slette mappen helt og gjenopprette den manuelt når du faktisk trenger den",
    ],
    c: 1,
    e: "En prompt-instruksjon er ikke-deterministisk — den kan glippe. En hook som blokkerer handlingen gir en garanti, og er det riktige verktøyet når kravet er absolutt.",
  },
  {
    d: "d2",
    q: "Hva er MCP-serveroppsett i Claude Code til for?",
    a: [
      "Å hoste Claude-modellen lokalt på maskinen din for å slippe å sende data ut",
      "Å koble Claude Code til eksterne verktøy og datakilder gjennom en standardisert protokoll",
      "Å komprimere kontekstvinduet automatisk når en lang samtale begynner å fylles opp",
      "Å sette opp et nettsidedesign med ferdige komponenter Claude kan bygge videre på",
    ],
    c: 1,
    e: "MCP standardiserer hvordan Claude Code når ut til eksterne systemer (databaser, API-er, verktøy). Det er «pluggen» mellom modellen og verden utenfor.",
  },
  {
    d: "d2",
    q: "Hvordan beskrives skills best, konseptuelt?",
    a: [
      "Tredjeparts språkmodeller du laster ned og kjører ved siden av Claude lokalt",
      "Pakker med kunnskap som Claude laster inn når de er relevante",
      "Et betalingsabonnement som låser opp ekstra funksjoner i Claude Code",
      "En type hook som kjører automatisk før hvert eneste verktøykall",
    ],
    c: 1,
    e: "Skills er on-demand «mapper» med fremgangsmåte og kontekst som lastes når oppgaven matcher. De utvider hva Claude *vet hvordan* den skal gjøre, uten å fylle konteksten hele tiden.",
  },
  {
    d: "d2",
    q: "Compliance-krav: alle AI-endringer i kodebasen må logges og kunne revideres. Beste tilnærming?",
    a: [
      "Stol på at modellen husker å logge hver endring den gjør underveis i arbeidet",
      "Hooks for deterministisk logging og review-porter, kombinert med begrenset (scoped) tilgang",
      "Slå av AI-verktøyene helt, siden compliance og automatisering ikke lar seg forene",
      "Be utviklerne om å skrive ned manuelt hva som ble endret etter hver økt",
    ],
    c: 1,
    e: "Når kravet er etterprøvbarhet, kan du ikke basere deg på at modellen husker. Hooks gir garantert logging/gating, og scoped tilgang begrenser hva som i det hele tatt kan skje.",
  },

  // D3 — Prompt engineering (7)
  {
    d: "d3",
    q: "Hva er den mest pålitelige måten å få maskinlesbar, strukturert output på?",
    a: [
      "Be modellen i prosa om å svare i JSON, og parse det den returnerer som tekst",
      "Bruk tool use / structured output med et input_schema som tvinger frem riktig form",
      "Be om svaret i Markdown og hent ut feltene du trenger fra formateringen",
      "Sett temperature til 0 og stol på at outputen da blir gyldig JSON hver gang",
    ],
    c: 1,
    e: "Et schema (via tool use / structured output) gir modellen en form å fylle ut, og du får parseable resultat. Å be om JSON i fritekst er mye skjørere i skala.",
  },
  {
    d: "d3",
    q: "Hva brukes prefilling av assistent-turen til?",
    a: [
      "Å gjøre svaret lengre ved å gi modellen en innledning den kan bygge videre på",
      "Å styre starten på svaret — for eksempel tvinge JSON ved å prefille en åpningsklamme",
      "Å skjule system-prompten for modellen så den ikke kan avsløre instruksjonene sine",
      "Å cache svaret slik at identiske spørsmål senere besvares uten et nytt kall",
    ],
    c: 1,
    e: "Ved å legge inn starten på assistentens svar styrer du formatet fra første token. Et klassisk grep: prefill «{» for å låse modellen inn i et JSON-svar.",
  },
  {
    d: "d3",
    q: "Hva er XML-tagger i prompten primært gode til?",
    a: [
      "Å gjøre prompten penere å se på uten å påvirke hvordan modellen tolker den",
      "Å avgrense input så modellen skiller instruksjoner, kontekst og data",
      "Å spare tokens, fordi tagger komprimerer teksten modellen må lese gjennom",
      "Å aktivere verktøybruk, siden modellen kjenner igjen tagger som verktøykall",
    ],
    c: 1,
    e: "Tydelige delimitere (som <context>…</context>) hjelper modellen å vite hva som er hva. Det reduserer at den blander sammen instruksjonen din med dataene du limte inn.",
  },
  {
    d: "d3",
    q: "Hvor hører varige rolle- og atferdsinstruksjoner hjemme?",
    a: [
      "I hver eneste brukermelding, så modellen blir minnet på reglene hver gang",
      "I system-prompten; brukermeldingen bærer den konkrete oppgaven",
      "I et eget verktøy modellen kaller for å hente reglene når den trenger dem",
      "I CLAUDE.md, som gjelder uansett hvilken kontekst kallet kjører i",
    ],
    c: 1,
    e: "System-prompten setter de stabile rammene (hvem modellen er og hvilke regler som gjelder). Brukermeldingen er den spesifikke oppgaven eller inputen for akkurat dette kallet.",
  },
  {
    d: "d3",
    q: "Når gir prompt caching mest verdi?",
    a: [
      "På korte, unike prompts som aldri gjentas, der hvert kall er helt forskjellig",
      "På stort, stabilt prefiks-innhold som gjenbrukes uendret på tvers av mange kall",
      "Bare på bilder og annet binærinnhold, ikke på vanlig tekst i prompten",
      "Når du vil ha mer kreative svar ved å gjenbruke tidligere genererte svar",
    ],
    c: 1,
    e: "Caching lønner seg når du sender det samme tunge prefikset (langt system-prompt, dokumenter) gang på gang — da slipper du å betale full pris for det hver gang. (Sjekk gjeldende vilkår i live-docs.)",
  },
  {
    d: "d3",
    q: "Du svarer på spørsmål basert på vedlagte dokumenter og vil redusere hallusinering. Beste grep?",
    a: [
      "Be modellen være mer selvsikker, så den slutter å nøle og gjette på svarene",
      "Instruer den til å svare kun fra gitt kontekst, sitere kilden, og si «vet ikke» ved mangel",
      "Øk temperature for mer variasjon, slik at den finner flere mulige svar å velge fra",
      "Fjern system-prompten, så modellen ikke begrenses unødig av instruksjonene dine",
    ],
    c: 1,
    e: "Grounding: bind svaret til den gitte konteksten, krev sitering, og gi modellen en eksplisitt utvei («vet ikke») når svaret ikke finnes. Da slutter den å dikte.",
  },
  {
    d: "d3",
    q: "Når er chain-of-thought / «thinking» mest nyttig?",
    a: [
      "På enkle oppslag som krever ett kort faktasvar uten noe mellomregning",
      "På flerstegs resonneringsoppgaver der modellen trenger å tenke før svar",
      "Når du vil gjøre svaret kortere ved å la modellen oppsummere underveis",
      "Aldri — eksplisitt resonnering sløser bare tokens uten å gjøre svaret bedre",
    ],
    c: 1,
    e: "Eksplisitt resonnering hjelper på oppgaver med flere steg. Du kan også skille tenkingen fra det endelige, strukturerte svaret slik at brukeren bare ser konklusjonen.",
  },

  // D4 — Tool/MCP (7)
  {
    d: "d4",
    q: "Hva kjennetegner en god verktøy-beskrivelse (tool description)?",
    a: [
      "Så kort som overhodet mulig, helst bare navnet, for å spare plass i konteksten",
      "Tydelig på hva verktøyet gjør OG når det skal brukes, med godt typede, beskrevne parametere",
      "En grundig teknisk beskrivelse av hvordan verktøyet er implementert under panseret",
      "Ingen beskrivelse er nødvendig så lenge navnet på verktøyet er beskrivende nok",
    ],
    c: 1,
    e: "Modellen velger verktøy basert på beskrivelsen. «Hva gjør det + når brukes det + tydelige parametere» gir riktig valg og riktige argumenter. Vage beskrivelser gir feil kall.",
  },
  {
    d: "d4",
    q: "Hva er MCP, i én setning?",
    a: [
      "En egen Claude-modell spesialisert for koding og verktøybruk i terminalen",
      "En åpen protokoll som standardiserer hvordan apper gir modeller kontekst og verktøy",
      "Et betalingssystem som måler og fakturerer API-bruk på tvers av verktøy",
      "Et frontend-rammeverk for å bygge brukergrensesnitt rundt språkmodeller",
    ],
    c: 1,
    e: "Model Context Protocol er den standardiserte «pluggen» (ofte sammenlignet med USB-C for AI) mellom en host-app og verktøy/datakilder den eksponerer.",
  },
  {
    d: "d4",
    q: "Hva er rollen til et verktøys input-schema?",
    a: [
      "Å dokumentere verktøyet for menneskene som skal lese koden senere",
      "Å begrense og validere argumentene (JSON schema) så modellen produserer gyldige kall",
      "Å bestemme hvilken modell som skal håndtere kallet når verktøyet brukes",
      "Å cache resultatet av verktøykallet så identiske kall slipper å kjøre på nytt",
    ],
    c: 1,
    e: "Schemaet er kontrakten for argumentene. Det reduserer ugyldige handlinger ved å gjøre det tydelig — og maskinelt verifiserbart — hva et gyldig kall ser ut som.",
  },
  {
    d: "d4",
    q: "En MCP-server eksponerer kraftige handlinger (slett, overfør penger). Beste praksis?",
    a: [
      "Eksponer alle handlinger åpent, slik at modellen står helt fritt til å løse oppgaven",
      "Begrens og scope tilgangen, krev auth, gi minste privilegium og bekreft destruktive handlinger",
      "Stol på at modellen aldri velger å utføre noe farlig uten en god grunn til det",
      "Skjul de farlige verktøyene ved å utelate dem fra beskrivelsen modellen ser",
    ],
    c: 1,
    e: "Minste privilegium og eksplisitt bekreftelse på destruktive handlinger. Du designer for at noe kan gå galt — ikke for at modellen alltid oppfører seg.",
  },
  {
    d: "d4",
    q: "I MCP: hva gjør host-/klientsiden, og hva eksponerer verktøyene?",
    a: [
      "Serveren kobler seg til klienter, som er de som faktisk leverer selve modellen",
      "Host/klient kobler seg til servere; serverne eksponerer verktøyene og ressursene",
      "Begge sider gjør det samme — skillet er bare et navn uten praktisk betydning",
      "Klienten eksponerer verktøyene, mens serveren kjører selve språkmodellen",
    ],
    c: 1,
    e: "Host-appen (klienten) kobler seg til én eller flere MCP-servere. Det er serverne som tilbyr verktøyene og ressursene modellen kan bruke.",
  },
  {
    d: "d4",
    q: "Du har laget mange overlappende verktøy. Hva er hovedrisikoen?",
    a: [
      "Høyere serverkostnad, fordi hvert ekstra verktøy må holdes kjørende hele tiden",
      "Modellen velger feil verktøy — hold dem distinkte, godt avgrenset og tydelig navngitt",
      "Tregere svar, siden modellen må laste inn alle verktøyene før hvert eneste kall",
      "Ingen reell risiko — jo flere verktøy modellen har, jo bedre løser den oppgaver",
    ],
    c: 1,
    e: "Overlappende verktøy forvirrer valget. Få, distinkte og tydelig navngitte verktøy gir mer pålitelig seleksjon enn et stort, uklart arsenal.",
  },
  {
    d: "d4",
    q: "Et verktøy returnerer en enorm payload. Hva er den arkitektoniske bekymringen?",
    a: [
      "Det ser rotete ut i loggen, men påvirker ikke hvordan modellen faktisk jobber",
      "Det spiser kontekst og tokens — returner bare det som trengs, paginer eller oppsummer",
      "Ingenting — mer data gjør alltid at modellen svarer raskere og mer presist",
      "Modellen ignorerer automatisk det den ikke trenger, så størrelsen er uvesentlig",
    ],
    c: 1,
    e: "Alt verktøyet returnerer havner i konteksten og koster tokens og fokus. Returner det relevante, paginer eller oppsummer — ikke dump rådata.",
  },

  // D5 — Context (5)
  {
    d: "d5",
    q: "En lang samtale begynner å degradere fordi kontekstvinduet fylles opp. Beste strategi?",
    a: [
      "Send hele historikken uendret hver gang, så ingenting viktig noensinne går tapt",
      "Oppsummer og komprimer eldre turer, behold det relevante og kast støyen",
      "Start en helt ny samtale ved hver melding for å holde konteksten kortest mulig",
      "Bytt til en mindre modell, som håndterer lange samtaler mer effektivt",
    ],
    c: 1,
    e: "Aktiv context management: hold det som betyr noe, komprimer eller dropp resten. Å bare dytte alt inn fyller vinduet med støy og svekker svarene.",
  },
  {
    d: "d5",
    q: "Hva er hovedhensikten med RAG (retrieval-augmented generation)?",
    a: [
      "Å gjøre modellen raskere ved å hente svar fra et hurtigminne i stedet for å resonnere",
      "Å hente relevant ekstern kunnskap inn i konteksten ved spørretid, så svaret grunnes i kilder",
      "Å erstatte system-prompten med dokumenter som styrer modellens oppførsel",
      "Å trene modellen på nytt på dine data så kunnskapen bakes permanent inn",
    ],
    c: 1,
    e: "RAG henter bare det relevante fra et stort korpus og legger det i konteksten når det trengs — slik kommer du forbi vindusgrensen og grunner svaret i faktiske kilder.",
  },
  {
    d: "d5",
    q: "Hvor bør de viktigste instruksjonene plasseres i en veldig lang kontekst?",
    a: [
      "Midt inne i den største databolken, der modellen leser aller mest grundig",
      "Tydelig fremme, gjerne forsterket — ikke begravd midt inne i en enorm kontekst",
      "Plasseringen spiller ingen rolle — modellen vekter all kontekst nøyaktig likt",
      "Helt til slutt, etter alle dataene, siden modellen husker det den leste sist best",
    ],
    c: 1,
    e: "Posisjon betyr noe. Kritiske instruksjoner hører fremme, og kan gjentas/forsterkes. Begraves de midt i et hav av data, er sjansen større for at de mistes.",
  },
  {
    d: "d5",
    q: "Hva betyr token-budsjettering i en flerstegs-workflow?",
    a: [
      "Å betale for et visst antall tokens på forhånd for å låse en lavere pris per kall",
      "Å fordele konteksten bevisst — input, resonnering og output — og trimme mellom steg",
      "Å bruke færrest mulig modeller i kjeden for å holde det totale token-forbruket nede",
      "Å sette max_tokens til høyeste mulige verdi så svaret aldri blir kuttet av",
    ],
    c: 1,
    e: "Du behandler konteksten som et budsjett du fordeler med vilje gjennom stegene, og rydder mellom dem. Ellers vokser den til den treffer taket og bryter sammen.",
  },
  {
    d: "d5",
    q: "Hvorfor cache et stabilt prefiks i konteksten?",
    a: [
      "For å gjøre svarene mer kreative ved å gjenbruke tidligere formuleringer på nytt",
      "For å kutte gjentatt kostnad og latens på innhold som ikke endrer seg mellom kall",
      "For å utvide kontekstvinduet utover modellens vanlige øvre grense",
      "For å unngå verktøybruk ved å hente svaret fra cache i stedet for å kalle",
    ],
    c: 1,
    e: "Et uendret prefiks (langt system-prompt, faste dokumenter) som sendes gang på gang trenger ikke betales for på nytt hver gang — caching kutter både kostnad og ventetid.",
  },

  /* ===== Utvidet sett ===== */

  // D1 — Agentic (10 til)
  {
    d: "d1",
    q: "En kompleks oppgave har flere klart adskilte steg. Hva gir mest pålitelig resultat?",
    a: [
      "Ett stort prompt som ber modellen utføre alle stegene samtidig i ett enkelt kall",
      "Prompt chaining — del opp i diskrete steg der hvert har avgrenset ansvar og kan valideres",
      "La en autonom agent improvisere fritt gjennom stegene uten noen fast struktur",
      "Kjør samme prompt mange ganger og la flertallet av svarene avgjøre resultatet",
    ],
    c: 1,
    e: "Prompt chaining bytter litt latens mot mye pålitelighet: hvert steg er enklere, lettere å verifisere, og feil fanges der de oppstår i stedet for å forplante seg gjennom ett uoversiktlig kall.",
  },
  {
    d: "d1",
    q: "Du vil heve kvaliteten på et generert utkast automatisk. Hvilket mønster passer?",
    a: [
      "Generer ti utkast i parallell og velg det lengste som det mest grundige svaret",
      "Evaluator-optimizer — én rolle genererer, en annen kritiserer i loop",
      "Øk temperature til maks så modellen blir mer kreativ i hvert nytt forsøk",
      "Be modellen bekrefte at utkastet er bra nok før den leverer det fra seg",
    ],
    c: 1,
    e: "Generator-kritiker-loopen lønner seg når kvalitet kan måles mot klare kriterier. Kritikken gir konkret, handlingsbar tilbakemelding som neste iterasjon retter etter — med en stoppbetingelse så det ikke looper i det uendelige.",
  },
  {
    d: "d1",
    q: "Innkommende forespørsler er svært ulike (faktura, klage, teknisk spørsmål). Hva er et godt mønster?",
    a: [
      "Ett felles prompt som forsøker å behandle alle forespørselstypene på helt lik måte",
      "Routing — klassifiser input først, og send så til en håndtering spesialisert for hver type",
      "Avvis alt som ikke er en faktura, og be brukeren omformulere resten av forespørslene",
      "Kjør alle håndteringene parallelt på hver forespørsel og slå sammen alle svarene",
    ],
    c: 1,
    e: "Routing skiller klassifisering fra håndtering. Hver type får en prompt/flyt skreddersydd for seg, i stedet for ett generelt prompt som gjør alt halvgodt.",
  },
  {
    d: "d1",
    q: "En agent kan utføre en irreversibel handling (f.eks. sende penger). Hvor bør et human-in-the-loop-sjekkpunkt ligge?",
    a: [
      "Etter at handlingen er utført, som en logg over det agenten faktisk gjorde",
      "Før den irreversible handlingen utføres — krev eksplisitt godkjenning akkurat der",
      "Det trengs ikke noe sjekkpunkt så lenge modellen er stor og kapabel nok",
      "Bare hvis brukeren uttrykkelig ber om å få godkjenne handlinger på forhånd",
    ],
    c: 1,
    e: "Sjekkpunktet hører foran det irreversible steget. Godkjenning i etterkant er bare en logg over noe du ikke lenger kan stoppe.",
  },
  {
    d: "d1",
    q: "En forretningsregel MÅ gjelde hver gang, uten unntak. Hvor legger du den?",
    a: [
      "I prompten, formulert tydelig nok til at modellen følger den hver eneste gang",
      "I deterministisk kode rundt modellen, ikke overlatt til modellens eget skjønn",
      "Som et eksempel i prompten som modellen kan etterligne i lignende tilfeller",
      "I CLAUDE.md, der den lastes inn automatisk og dermed alltid gjelder for kallet",
    ],
    c: 1,
    e: "Skal noe gjelde absolutt, kan det ikke overlates til en sannsynlighetsmodell. Kritiske regler hører i kode; modellen brukes der skjønn faktisk er ønsket.",
  },
  {
    d: "d1",
    q: "I en agent-loop — hva er riktig rekkefølge per steg?",
    a: [
      "Kall flere verktøy fortløpende og les alle resultatene samlet til slutt i loopen",
      "Observer forrige verktøyresultat, resonner, og velg neste handling — så gjenta",
      "Velg alle handlingene på forhånd og kjør dem gjennom i en fast rekkefølge",
      "Hopp over resultatet fra forrige kall og gå rett videre til det neste kallet",
    ],
    c: 1,
    e: "En fungerende agent-loop er observer → tenk → handle. Å fyre av neste kall uten å lese forrige resultat er å handle i blinde — da kan ikke agenten korrigere kurs.",
  },
  {
    d: "d1",
    q: "Et verktøy en agent bruker har sideeffekter og kan bli kalt på nytt ved retry. Hva bør du designe for?",
    a: [
      "At verktøyet er bygget så solid at det aldri feiler og dermed aldri trenger retry",
      "Idempotens — at gjentatt kall med samme input er trygt og ikke dobler effekten",
      "At agenten konfigureres til aldri å prøve et feilet verktøykall på nytt igjen",
      "At brukeren rydder opp manuelt dersom en handling skulle bli utført to ganger",
    ],
    c: 1,
    e: "Retries skjer. Designer du sideeffekt-verktøy idempotente (f.eks. med en unik nøkkel per operasjon), blir en gjentakelse ufarlig i stedet for at du sender pengene to ganger.",
  },
  {
    d: "d1",
    q: "Hvordan opprettholder du tilstand på tvers av turer i en agent-flyt?",
    a: [
      "Modellen husker selv det som ble sagt tidligere i samtalen mellom hvert kall",
      "Du sender relevant tilstand og historikk eksplisitt inn i hvert kall — modellen er statsløs",
      "Tilstanden lagres automatisk i modellens vekter etter hvert som samtalen utvikler seg",
      "Det er ikke mulig å holde på tilstand i en agent over flere turer i praksis",
    ],
    c: 1,
    e: "Modellen har ikke minne mellom kall. All tilstand du trenger videre må du føre med deg eksplisitt i konteksten for neste kall.",
  },
  {
    d: "d1",
    q: "En subagent gjør et stort stykke arbeid. Hva bør den returnere til orkestratoren?",
    a: [
      "Hele sin egen samtale-transkripsjon, så orkestratoren ser alt som skjedde underveis",
      "Et fokusert sammendrag eller resultat — ikke hele sin interne kontekst",
      "Ingenting — orkestratoren gjetter resultatet ut fra oppgaven den opprinnelig ga",
      "Alle mellomregninger råe, slik at ingenting går tapt på veien tilbake",
    ],
    c: 1,
    e: "Poenget med isolerte subagenter forsvinner hvis de dumper hele konteksten sin tilbake. La dem returnere et komprimert resultat så orkestratorens kontekst holder seg ren.",
  },
  {
    d: "d1",
    q: "Du har en enkel klassifisering og en tung resonneringsoppgave i samme system. Smart kostnadsgrep?",
    a: [
      "Bruk den største modellen til alt, så er du sikker på god kvalitet overalt i systemet",
      "Bruk en mindre, raskere modell til det enkle og reserver den store til det tunge",
      "Bruk den minste modellen til alt og aksepter litt lavere kvalitet på det tunge",
      "Bytt modell tilfeldig per kall for å fordele belastningen jevnt utover systemet",
    ],
    c: 1,
    e: "Match modellstørrelse til oppgavens vanskelighet. Å sende triviell ruting gjennom den dyreste modellen er sløsing; spar kraften til stegene som trenger den.",
  },

  // D2 — Claude Code (7 til)
  {
    d: "d2",
    q: "Hvorfor bør CLAUDE.md holdes kortfattet og høy-signal?",
    a: [
      "Fordi lange filer er tungvinte å committe og skaper unødige merge-konflikter i teamet",
      "Fordi den ligger i konteksten hele tiden — oppblåst innhold koster tokens og uthuler det viktige",
      "Fordi Claude bare leser de første linjene i filen og hopper over resten uansett",
      "Det spiller egentlig ingen rolle hvor lang den er, så lenge innholdet faktisk stemmer",
    ],
    c: 1,
    e: "CLAUDE.md er alltid med i konteksten. Fyller du den med alt mulig, drukner de viktige konvensjonene og du betaler tokens for støy hvert eneste kall.",
  },
  {
    d: "d2",
    q: "Du vil delegere en avgrenset deloppgave uten å fylle hovedsamtalen med støy. Hva passer?",
    a: [
      "Lim alt det relevante inn i hovedsamtalen så Claude har full oversikt hele tiden",
      "En subagent som løser deloppgaven i egen kontekst og returnerer bare resultatet",
      "Start hele prosjektet på nytt med deloppgaven som aller første prioritet",
      "Skru av CLAUDE.md midlertidig så konteksten ikke fylles opp mens du jobber",
    ],
    c: 1,
    e: "En subagent får sin egen kontekst til deloppgaven og leverer tilbake et resultat. Hovedsamtalen holdes ren for det den faktisk handler om.",
  },
  {
    d: "d2",
    q: "Hva styrer en permission-/allowlist-konfigurasjon i Claude Code?",
    a: [
      "Hvilken modell som brukes, avhengig av hvor følsom den aktuelle oppgaven er",
      "Hvilke verktøy og kommandoer Claude Code får kjøre uten å spørre om lov først",
      "Fargetema og generelt utseende i terminalen mens Claude Code kjører økten",
      "Hvor raskt svaret kommer, ved å prioritere de godkjente kommandoene høyest",
    ],
    c: 1,
    e: "Tillatelser avgjør hva som kan kjøres automatisk versus hva som krever bekreftelse. Det er et sikkerhets- og kontroll-lag, særlig viktig i team og automatiserte oppsett.",
  },
  {
    d: "d2",
    q: "Du har konvensjoner som gjelder hele repoet, og noen som bare gjelder én undermappe. Hvordan løses det best?",
    a: [
      "Alt samlet i én CLAUDE.md i roten, med tydelige overskrifter for hver enkelt mappe",
      "CLAUDE.md i roten for det felles, og en mer spesifikk i undermappen for det lokale",
      "Gjenta hele konvensjonssettet i en egen CLAUDE.md i hver eneste mappe i repoet",
      "Legg undermappe-reglene som kommentarer i koden der de faktisk skal gjelde",
    ],
    c: 1,
    e: "CLAUDE.md-er kan ligge i et hierarki. Det generelle hører i roten; det som bare gjelder en del av kodebasen legges nærmere der det gjelder.",
  },
  {
    d: "d2",
    q: "Hva er et plugin i Claude Code, konseptuelt?",
    a: [
      "En enkelt gjenbrukbar prompt du kan kalle opp med en kort kommando ved behov",
      "En pakke som samler kommandoer, subagenter, hooks og/eller MCP-oppsett for distribusjon",
      "En betalingsplan som låser opp ekstra kapasitet og funksjoner i Claude Code",
      "En modellvariant optimalisert for et bestemt programmeringsspråk eller rammeverk",
    ],
    c: 1,
    e: "Et plugin bunter sammen relatert funksjonalitet (kommandoer, agenter, hooks, MCP) slik at et team kan installere og dele et helt oppsett i én pakke.",
  },
  {
    d: "d2",
    q: "Et MCP-serveroppsett skal være tilgjengelig for hele teamet i ett bestemt prosjekt. Hvilket scope?",
    a: [
      "Bruker-scope, som gir deg serveren tilgjengelig på tvers av alle prosjektene dine",
      "Prosjekt-scope committet til repoet, så alle på prosjektet får serveren der den hører hjemme",
      "Et globalt scope på maskinen som ingen andre i teamet kan endre i ettertid",
      "MCP-servere kan ikke deles, og må settes opp av hver enkelt utvikler på nytt",
    ],
    c: 1,
    e: "Prosjekt-scope committet til repoet gir hele teamet samme MCP-server akkurat der den hører hjemme. Bruker-scope ville bare gitt det til deg.",
  },
  {
    d: "d2",
    q: "Hva er den praktiske forskjellen på en hook og en instruksjon i CLAUDE.md?",
    a: [
      "Ingen reell forskjell — begge styrer oppførselen til Claude Code på akkurat samme måte",
      "En hook er kode som kjører garantert; CLAUDE.md er veiledning modellen kan avvike fra",
      "CLAUDE.md kjører kode automatisk, mens en hook bare er ren tekst modellen leser",
      "Hooks gjelder kun designoppgaver, mens CLAUDE.md gjelder kun rene kodeoppgaver",
    ],
    c: 1,
    e: "Trenger du en garanti, bruk en hook — den kjører uansett. CLAUDE.md former oppførsel, men er fortsatt instruksjoner en sannsynlighetsmodell kan tolke eller glippe på.",
  },

  // D3 — Prompt engineering (7 til)
  {
    d: "d3",
    q: "Du vil ha konsistent format og oppførsel på et vanskelig kanttilfelle. Hva hjelper mest?",
    a: [
      "Be modellen om å «være nøyaktig» og passe ekstra godt på de vanskelige spesialtilfellene",
      "Few-shot — vis noen konkrete eksempler på ønsket input→output, inkludert kanttilfellet",
      "Skru opp temperature så modellen utforsker flere måter å håndtere tilfellet på",
      "Gjør prompten kortere så modellen ikke distraheres av for mange detaljer på en gang",
    ],
    c: 1,
    e: "Eksempler styrer sterkere enn forklaringer. Et par gode few-shot-eksempler — særlig av det vanskelige tilfellet — viser modellen presist hva du vil ha, i stedet for at den må gjette.",
  },
  {
    d: "d3",
    q: "Hva gir mest pålitelig oppførsel?",
    a: [
      "Vage instruksjoner som lar modellen stå fritt til å tolke oppgaven slik den vil",
      "Eksplisitte, spesifikke instruksjoner om nøyaktig hva du vil ha og hvordan",
      "Å anta at modellen allerede kjenner konteksten og preferansene dine fra før",
      "Å utelate format-krav så modellen selv velger det formatet den synes passer best",
    ],
    c: 1,
    e: "Modellen leser ikke tankene dine. Det du lar være uspesifisert, fyller den ut etter eget skjønn — vær eksplisitt om format, omfang og krav når det betyr noe.",
  },
  {
    d: "d3",
    q: "Du har et veldig langt dokument og ett spørsmål om det. Hva er en god rekkefølge i prompten?",
    a: [
      "Spørsmålet først og dokumentet etterpå, så modellen vet hva den skal se etter",
      "Det lange dokumentet først, og spørsmålet eller instruksjonen helt til slutt",
      "Bland dokument og spørsmål om hverandre så de henger tett sammen gjennom prompten",
      "Rekkefølgen har ingen betydning for hvor godt modellen klarer å svare på spørsmålet",
    ],
    c: 1,
    e: "Med lange inputs lønner det seg å legge det store materialet øverst og spørsmålet til slutt. Da har modellen instruksjonen friskt i minne idet den skal svare.",
  },
  {
    d: "d3",
    q: "Hva er en effektiv måte å låse outputen til et bestemt format?",
    a: [
      "Håp at modellen treffer riktig format ut fra konteksten den får i spørsmålet",
      "Gi en eksplisitt mal eller struktur, og eventuelt prefill starten på svaret",
      "Be om at svaret skal være «pent» og ryddig formatert når det leveres",
      "Sett temperature til 1 så modellen selv finner det formatet som passer best",
    ],
    c: 1,
    e: "Vis formen du vil ha — en mal, et skjelett, eller en prefill av starten. Konkret struktur gir konsistent output; «pent» er ikke en spesifikasjon.",
  },
  {
    d: "d3",
    q: "Hva styrer temperature-parameteren?",
    a: [
      "Hvor langt svaret blir, ved å styre hvor mange tokens modellen får lov å bruke",
      "Graden av tilfeldighet — lav gir mer konsistente svar, høy gir mer variasjon",
      "Hvor mange verktøy modellen har tilgang til i løpet av et enkelt kall",
      "Størrelsen på kontekstvinduet og hvor mye modellen kan lese om gangen",
    ],
    c: 1,
    e: "Temperature er randomness-knappen. Lav verdi for oppgaver som krever konsistens og presisjon; høyere for idémyldring og variasjon.",
  },
  {
    d: "d3",
    q: "Hvorfor sette en tydelig rolle i system-prompten (f.eks. «du er en erfaren revisor»)?",
    a: [
      "Det gjør svarene lengre fordi modellen forklarer mer når den er gitt en rolle",
      "Det rammer inn domene, tone og forventninger, og hever relevansen på svarene",
      "Det er et påkrevd felt i API-et som kallet rett og slett feiler uten",
      "Det reduserer token-kostnaden ved å korte ned hvor mye modellen må lese",
    ],
    c: 1,
    e: "En presis rolle gir modellen et fagspråk og et perspektiv å svare fra. Det styrer både innhold og tone mot det du faktisk trenger.",
  },
  {
    d: "d3",
    q: "Et komplekst prompt blander instruksjoner, kontekst, eksempler og selve inputen. Hva hjelper?",
    a: [
      "Skriv alt sammen i én lang, flytende setning så det henger mest mulig naturlig sammen",
      "Del det i tydelig merkede seksjoner, for eksempel med XML-tagger, så modellen ser hva som er hva",
      "Fjern all struktur og la modellen finne ut av sammenhengen helt på egen hånd",
      "Send bare selve inputen uten instruksjoner, så modellen ikke blir forvirret av krav",
    ],
    c: 1,
    e: "Klar seksjonering — instruksjon, kontekst, eksempler, input hver for seg — gjør at modellen ikke forveksler dataene dine med oppgaven. XML-tagger er et vanlig grep for nettopp dette.",
  },

  // D4 — Tool/MCP (7 til)
  {
    d: "d4",
    q: "En MCP-server vil tilby skrivebeskyttet referansedata modellen kan slå opp i. Hvilken primitive passer?",
    a: [
      "Et tool, siden alt modellen henter fra serveren regnes som en handling den utfører",
      "En resource — kontekstuell, skrivebeskyttet data som serveren eksponerer for modellen",
      "En hook som kjører og henter dataene inn automatisk før hvert kall til modellen",
      "Et plugin som bunter referansedataene sammen med kommandoene som bruker dem",
    ],
    c: 1,
    e: "MCP skiller tools (handlinger modellen kan utføre) fra resources (data den kan lese). Statisk referansemateriale passer som resource; handlinger med effekt er tools.",
  },
  {
    d: "d4",
    q: "Hva kjennetegner gode verktøynavn?",
    a: [
      "Korte og kryptiske forkortelser som sparer plass i den samlede verktøylisten",
      "Tydelige, handlingsorienterte og entydige navn som ikke overlapper med andre verktøy",
      "Tilfeldige navn for variasjon, så modellen ikke fester seg ensidig ved ett verktøy",
      "Samme navn på flere beslektede verktøy så de grupperes naturlig sammen i lista",
    ],
    c: 1,
    e: "Modellen velger verktøy delvis på navnet. Entydige, beskrivende navn reduserer feilvalg; kryptiske eller overlappende navn inviterer til forveksling.",
  },
  {
    d: "d4",
    q: "Hvordan bør et verktøy håndtere en feil (f.eks. ugyldig input)?",
    a: [
      "Returnere ingenting og la modellen merke selv at noe gikk galt med kallet",
      "Returnere en strukturert, beskrivende feilmelding modellen kan forstå og rette etter",
      "Krasje hele agenten så feilen ikke får forplante seg videre i kjøringen",
      "Late som alt gikk bra og returnere et tomt, men formelt sett gyldig resultat",
    ],
    c: 1,
    e: "En god feilmelding er handlingsbar for modellen: den forteller hva som var galt, så agenten kan korrigere og prøve på nytt. Stille feil etterlater modellen i blinde.",
  },
  {
    d: "d4",
    q: "Hva er forskjellen på MCP over stdio og over HTTP, konseptuelt?",
    a: [
      "Det er ingen reell forskjell — valget handler bare om personlig preferanse hos utvikleren",
      "stdio passer lokale servere på samme maskin; HTTP/SSE passer eksterne servere over nettverk",
      "stdio brukes til bilder og binærdata, mens HTTP brukes til ren tekstkommunikasjon",
      "HTTP er alltid usikkert, så stdio er det eneste trygge valget i praktisk bruk",
    ],
    c: 1,
    e: "Transporten følger hvor serveren kjører: stdio for en lokal prosess på samme maskin, HTTP-basert transport for en server du når over nettverket.",
  },
  {
    d: "d4",
    q: "Hvordan reduserer du ugyldige argumenter til et verktøy?",
    a: [
      "La alle parametere være frie strenger så modellen står helt fritt til å fylle dem ut",
      "Bruk presise typer og enums i schemaet der verdiene er kjente og begrensede",
      "Dropp schemaet helt og valider heller argumentene inne i selve verktøykoden",
      "Be modellen være ekstra forsiktig når den fyller ut parameterne til verktøyet",
    ],
    c: 1,
    e: "Et stramt schema gjør ugyldige kall vanskeligere. Enums og presise typer begrenser hva modellen kan sende, så feil fanges av kontrakten i stedet for i kjøretid.",
  },
  {
    d: "d4",
    q: "Når bør noe eksponeres som en resource fremfor et tool i MCP?",
    a: [
      "Nesten alltid resource, siden tools er reservert for noen få sjeldne spesialtilfeller",
      "Når det er data å lese eller referere til; tools er for handlinger som faktisk gjør noe",
      "Nesten alltid tool, fordi modellen jobber best når absolutt alt er en handling",
      "Det er tilfeldig hva du velger — MCP behandler resources og tools helt likt uansett",
    ],
    c: 1,
    e: "Tommelregel: data du leser → resource; handling som har en effekt → tool. Skillet hjelper både modellen og deg å holde styr på hva som er trygt å hente og hva som endrer noe.",
  },
  {
    d: "d4",
    q: "En MCP-server trenger autentisering mot et eksternt API. Hvor hører legitimasjonen hjemme?",
    a: [
      "Sendt gjennom modellens kontekst i klartekst så den kan bruke nøkkelen ved behov",
      "Håndtert på server- og integrasjonssiden — ikke ført gjennom modellens kontekst",
      "Skrevet inn i hvert prompt slik at riktig nøkkel alltid er tilgjengelig for kallet",
      "Lagret i verktøybeskrivelsen som modellen leser før den kaller selve verktøyet",
    ],
    c: 1,
    e: "Hemmeligheter skal aldri gjennom modellens kontekst. Auth håndteres der serveren snakker med det eksterne systemet, utenfor det modellen ser.",
  },

  // D5 — Context (5 til)
  {
    d: "d5",
    q: "Hvorfor er plasseringen av nøkkelinfo i en lang kontekst viktig?",
    a: [
      "Modeller leser i praksis bare den aller siste setningen før de begynner å svare",
      "Modeller fester seg mindre ved info midt i en lang kontekst enn ved start og slutt",
      "Plasseringen har ingen reell effekt — modellen vekter hele konteksten nøyaktig likt",
      "Modeller leser konteksten bakfra, så det aller viktigste bør stå helt nederst",
    ],
    c: 1,
    e: "«Lost in the middle»: det som ligger begravd midt i et langt vindu er lettere å overse enn det som står først eller sist. Legg det kritiske der det blir sett.",
  },
  {
    d: "d5",
    q: "Hva er en god chunking-strategi for RAG?",
    a: [
      "Så store chunks som overhodet mulig, så hver bit inneholder mest mulig kontekst",
      "Semantisk sammenhengende chunks — store nok til å bære mening, små nok til å unngå støy",
      "Ett ord per chunk for å gi maksimal presisjon i søket etter relevante treff",
      "Tilfeldig oppdeling, siden innholdet uansett rangeres på relevans i ettertid",
    ],
    c: 1,
    e: "Chunk-størrelse er en avveining: for store gir støy og kostnad, for små mister sammenheng. Mål er biter som henger sammen meningsmessig, så retrieval henter noe brukbart.",
  },
  {
    d: "d5",
    q: "En RAG-pipeline gir dårlige svar. Hva er den mest sannsynlige grunnleggende årsaken å sjekke først?",
    a: [
      "At modellen rett og slett er for liten, og at en større modell ville løst det meste",
      "Kvaliteten på det som hentes — irrelevant retrieval gir irrelevant svar uansett modell",
      "At temperature er satt feil, så svarene blir mer tilfeldige enn de egentlig burde",
      "At system-prompten er for kort til å gi modellen nok å gå på i svaret sitt",
    ],
    c: 1,
    e: "RAG er bare så godt som det den henter. Får modellen feil eller irrelevant kontekst, hjelper det lite hvor sterk modellen er — start feilsøkingen i retrieval-leddet.",
  },
  {
    d: "d5",
    q: "Et stort kontekstvindu betyr at du bør fylle det helt. Sant eller usant?",
    a: [
      "Sant — mer kontekst gir alltid bedre svar, så fyll opp så mye plass du klarer",
      "Usant — overflødig kontekst kan fortynne det relevante og koste unødig, så vær selektiv",
      "Sant, så lenge alt innholdet faktisk får plass innenfor grensen på vinduet",
      "Usant, fordi modellen uansett ignorerer alt utenom de aller første tokenene",
    ],
    c: 1,
    e: "Plass er ikke en plikt til å fylle den. Irrelevant fyll konkurrerer med det viktige om modellens oppmerksomhet og koster tokens — kvalitet på kontekst slår kvantitet.",
  },
  {
    d: "d5",
    q: "Hvordan gjør du et RAG-svar etterprøvbart for brukeren?",
    a: [
      "Be modellen svare mer selvsikkert, så brukeren føler seg trygg på resultatet",
      "Returner kildene eller sitatene svaret bygger på, så brukeren selv kan verifisere det",
      "Skjul hvor informasjonen kom fra, så svaret fremstår mer autoritativt og rent",
      "Øk temperature for å få modellen til å formulere svaret mer overbevisende",
    ],
    c: 1,
    e: "Når svaret peker tilbake på kildene sine, kan brukeren sjekke det selv. Sitering gjør RAG-svar etterprøvbare og bygger tillit — og gjør hallusinasjoner lettere å avsløre.",
  },
];

/* ---------- State + persistence ---------- */
const STORE_KEY = "cca:stats:v1";
const SESSION_KEY = "cca:session:v1";
let mem = {}; // last-resort fallback when neither window.storage nor localStorage works
/* Storage adapter: prefer the host's window.storage; otherwise localStorage so progress
   and a paused session survive a page refresh in a normal browser; finally in-memory.
   Values are always JSON strings, matching the window.storage {value} shape. */
const store = {
  async get(k) {
    if (window.storage) {
      try {
        return await window.storage.get(k);
      } catch (e) {}
    }
    try {
      return { value: localStorage.getItem(k) };
    } catch (e) {
      return { value: k in mem ? mem[k] : null };
    }
  },
  async set(k, v) {
    if (window.storage) {
      try {
        await window.storage.set(k, v);
        return;
      } catch (e) {}
    }
    try {
      localStorage.setItem(k, v);
    } catch (e) {
      mem[k] = v;
    }
  },
  async delete(k) {
    if (window.storage) {
      try {
        await window.storage.delete(k);
        return;
      } catch (e) {}
    }
    try {
      localStorage.removeItem(k);
    } catch (e) {
      delete mem[k];
    }
  },
};
function blankStats() {
  const s = {};
  DOMAINS.forEach((d) => (s[d.id] = { seen: 0, correct: 0 }));
  return s;
}
let stats = blankStats();
let savedSession = null; // paused session loaded from storage

async function loadStats() {
  try {
    const r = await store.get(STORE_KEY);
    if (r && r.value) {
      stats = JSON.parse(r.value);
    }
  } catch (e) {
    /* keep blank stats */
  }
  // backfill any new domains
  DOMAINS.forEach((d) => {
    if (!stats[d.id]) stats[d.id] = { seen: 0, correct: 0 };
  });
}
async function saveStats() {
  try {
    await store.set(STORE_KEY, JSON.stringify(stats));
  } catch (e) {}
}
async function resetStats() {
  stats = blankStats();
  try {
    await store.delete(STORE_KEY);
  } catch (e) {}
  render();
}

/* Persist the in-progress session so it survives a reload */
async function persistSession() {
  if (!session) {
    return;
  }
  try {
    await store.set(SESSION_KEY, JSON.stringify({ mode, focus, session }));
  } catch (e) {}
}
async function loadSavedSession() {
  try {
    const r = await store.get(SESSION_KEY);
    if (r && r.value) {
      savedSession = JSON.parse(r.value);
    }
  } catch (e) {}
}
async function clearSavedSession() {
  savedSession = null;
  try {
    await store.delete(SESSION_KEY);
  } catch (e) {}
}

/* ---------- Session ---------- */
let mode = "study"; // "study" | "exam"
let focus = "weighted"; // "weighted" | domain id
let session = null;

function masteryPct(d) {
  const s = stats[d.id];
  return s.seen ? Math.round((100 * s.correct) / s.seen) : 0;
}
function overallReadiness() {
  // weighted by exam weight; only counts domains you've actually practiced
  let num = 0,
    den = 0;
  DOMAINS.forEach((d) => {
    const s = stats[d.id];
    if (s.seen) {
      num += d.weight * (s.correct / s.seen);
      den += d.weight;
    }
  });
  return den ? Math.round((num / den) * 100) : 0;
}
function totalSeen() {
  return DOMAINS.reduce((a, d) => a + stats[d.id].seen, 0);
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* Shuffle a question's answer options and remap the correct index,
   so the right answer isn't always in the same position. */
function shuffleOptions(q) {
  const order = shuffle(q.a.map((_, i) => i));
  return { ...q, a: order.map((i) => q.a[i]), c: order.indexOf(q.c) };
}

function buildSession() {
  let pool;
  if (focus === "weighted") {
    // proportional-ish mix across all domains
    pool = shuffle(Q);
    const n = mode === "exam" ? 15 : 10;
    // weighted sampling: roughly follow exam weights
    const picks = [];
    const byDom = {};
    DOMAINS.forEach(
      (d) => (byDom[d.id] = shuffle(Q.filter((q) => q.d === d.id))),
    );
    const targets = DOMAINS.map((d) => ({
      id: d.id,
      t: Math.max(1, Math.round((n * d.weight) / 100)),
    }));
    targets.forEach((tt) => {
      for (let i = 0; i < tt.t && byDom[tt.id].length; i++) {
        picks.push(byDom[tt.id].pop());
      }
    });
    pool = shuffle(picks);
  } else {
    pool = shuffle(Q.filter((q) => q.d === focus));
  }
  // shuffle the answer options for each picked question (stored in the session,
  // so the order stays stable across pause/resume)
  pool = pool.map(shuffleOptions);
  session = {
    items: pool,
    i: 0,
    answered: false,
    lastPick: null,
    correctCount: 0,
    log: [],
    elapsedMs: 0,
  };
}

/* ---------- Rendering ---------- */
const app = document.getElementById("app");
function dom(id) {
  return DOMAINS.find((d) => d.id === id);
}

function render() {
  if (session) {
    renderQuestion();
    return;
  }
  renderHome();
}

function renderHome() {
  const ready = overallReadiness();
  const seen = totalSeen();
  app.innerHTML = `
    <div class="eyebrow">Claude Certified Architect · Foundations</div>
    <h1>CCA-trener</h1>
    <p class="lede">Aktiv gjenkalling slår passiv lesing. Øv på scenario-spørsmål vektet etter de fem domenene, se hvor du står per domene, og bygg mot bestått.</p>

    <div class="card">
      <div class="meter-head">
        <h2>Mestring per domene</h2>
        <span class="sub">bredde = eksamensvekt · fyll = din mestring</span>
      </div>
      <div class="barlabels">
        ${DOMAINS.map(
          (d) => `
          <div class="barlabel" style="flex:${d.weight};">
            <div class="nm">${d.short}</div>
            <div class="wt">${d.weight}%</div>
          </div>`,
        ).join("")}
      </div>
      <div class="bar" role="img" aria-label="Mestring per domene, bredde tilsvarer eksamensvekt">
        ${DOMAINS.map(
          (d) => `
          <div class="seg" style="flex:${d.weight}; background:${d.hex}1f;">
            <div class="fill" style="height:${masteryPct(d)}%; background:${d.hex};"></div>
          </div>`,
        ).join("")}
      </div>
      <div class="legend">
        ${DOMAINS.map((d) => {
          const s = stats[d.id];
          return `
          <div class="row"><span class="dot" style="background:${d.hex}"></span>${d.short}
          <span class="pct">${s.seen ? masteryPct(d) + "% · " + s.correct + "/" + s.seen : "–"}</span></div>`;
        }).join("")}
      </div>
      <div class="readiness">
        <span class="num">${seen ? ready + "%" : "–"}</span>
        <span class="cap">vektet beredskap${seen ? "" : " · ingen øvinger ennå"}</span>
      </div>
    </div>

    ${
      savedSession
        ? `
    <div class="card mt resume">
      <h2>Pauset økt</h2>
      <p class="resume-meta">${dom(savedSession.session.items[savedSession.session.i].d).short} · spørsmål ${savedSession.session.i + 1} / ${savedSession.session.items.length} · ${savedSession.mode === "exam" ? "eksamenssim" : "øving"}</p>
      <div class="btnrow">
        <button class="btn" id="resumeBtn">Fortsett økt →</button>
        <button class="btn ghost sm" id="dropBtn">Forkast</button>
      </div>
    </div>`
        : ""
    }

    <div class="card mt">
      <h2>Start en ny økt</h2>
      <div class="controls">
        <div class="field">
          <label>Modus</label>
          <div class="opts" id="modeOpts">
            <button class="chip" data-v="study" aria-pressed="${mode === "study"}">Øving · forklaring underveis</button>
            <button class="chip" data-v="exam" aria-pressed="${mode === "exam"}">Eksamenssim · fasit til slutt</button>
          </div>
        </div>
        <div class="field">
          <label>Fokus</label>
          <div class="opts" id="focusOpts">
            <button class="chip" data-v="weighted" aria-pressed="${focus === "weighted"}">Vektet miks</button>
            ${DOMAINS.map((d) => `<button class="chip" data-v="${d.id}" aria-pressed="${focus === d.id}"${focus === d.id ? ` style="background:${d.hex};border-color:${d.hex};color:#fff"` : ""}>${d.short}</button>`).join("")}
          </div>
        </div>
      </div>
      <div class="btnrow">
        <button class="btn" id="startBtn">${savedSession ? "Start ny (forkast pauset) →" : "Start økt →"}</button>
        ${seen ? `<button class="btn ghost sm" id="resetBtn">Nullstill fremgang</button>` : ""}
      </div>
    </div>

    <div class="disclaimer">
      Spørsmålene er praksis-spørsmål skrevet for å teste konseptene i de fem domenene — ikke ekte eksamensoppgaver, som er hemmelige og proktorerte. Domenevektene (27/20/20/18/15) kommer fra en community-guide og er ikke bekreftet av Anthropic. Priser, rate limits og kontekststørrelser endrer seg — verifiser slike tall i offisiell dokumentasjon før eksamen.
    </div>
  `;
  document.getElementById("modeOpts").addEventListener("click", (e) => {
    const b = e.target.closest(".chip");
    if (!b) return;
    mode = b.dataset.v;
    renderHome();
  });
  document.getElementById("focusOpts").addEventListener("click", (e) => {
    const b = e.target.closest(".chip");
    if (!b) return;
    focus = b.dataset.v;
    renderHome();
  });
  document.getElementById("startBtn").addEventListener("click", async () => {
    await clearSavedSession();
    buildSession();
    await persistSession();
    render();
  });
  const rb = document.getElementById("resetBtn");
  if (rb) rb.addEventListener("click", resetStats);
  const resB = document.getElementById("resumeBtn");
  if (resB)
    resB.addEventListener("click", () => {
      mode = savedSession.mode;
      focus = savedSession.focus;
      session = savedSession.session;
      savedSession = null;
      render();
    });
  const drpB = document.getElementById("dropBtn");
  if (drpB)
    drpB.addEventListener("click", async () => {
      await clearSavedSession();
      renderHome();
    });
}

function renderQuestion() {
  const it = session.items[session.i];
  const d = dom(it.d);
  const total = session.items.length;
  app.innerHTML = `
    <div class="qmeta">
      <span class="domtag" style="background:${d.hex}">${d.short}</span>
      <div class="qmeta-right">
        ${mode === "exam" ? '<span class="examclock" id="examTimer" aria-hidden="true"></span>' : ""}
        <span class="progress-mini">${session.i + 1} / ${total} · ${mode === "exam" ? "eksamenssim" : "øving"}</span>
        <button class="link-btn" id="pauseBtn" title="Lagre og gå til oversikt">Pause</button>
        <button class="link-btn danger" id="abortBtn" title="Forkast denne økten">Avbryt</button>
      </div>
    </div>
    <div class="card">
      <div class="qtext">${it.q}</div>
      <div class="answers" id="answers">
        ${it.a.map((opt, k) => `<button class="ans" data-k="${k}"><span class="key">${"ABCD"[k]}</span><span>${opt}</span></button>`).join("")}
      </div>
      <div id="explainSlot"></div>
      <div class="btnrow" id="navSlot"></div>
    </div>
  `;
  const answersEl = document.getElementById("answers");
  answersEl.addEventListener("click", (e) => {
    const b = e.target.closest(".ans");
    if (!b || session.answered) return;
    pick(parseInt(b.dataset.k, 10));
  });
  document.getElementById("pauseBtn").addEventListener("click", async () => {
    timerFreeze(); // stop the exam clock; resumes on continue
    await persistSession(); // already persisted, but ensure latest
    await loadSavedSession(); // refresh savedSession for the home banner
    session = null;
    renderHome();
  });
  document.getElementById("abortBtn").addEventListener("click", async () => {
    timerFreeze();
    await clearSavedSession();
    session = null;
    renderHome();
  });
  // If resuming onto an already-answered question, restore its revealed state
  if (session.answered && session.lastPick != null) {
    revealAnswer(session.lastPick);
  }
  // Exam-sim clock (count-up with target); freezes when leaving this screen.
  if (mode === "exam") {
    session.elapsedMs = session.elapsedMs || 0;
    const t = document.getElementById("examTimer");
    if (t) renderTimerInto(t);
    timerEnsureRunning();
  }
}

function revealAnswer(k) {
  const it = session.items[session.i];
  const correct = k === it.c;
  const btns = [...document.querySelectorAll(".ans")];
  btns.forEach((b, idx) => {
    b.setAttribute("disabled", "true");
    if (idx === it.c) b.classList.add("correct");
    if (idx === k && !correct) b.classList.add("wrong");
  });
  if (mode === "study") {
    document.getElementById("explainSlot").innerHTML = `
      <div class="explain">
        <div class="verdict ${correct ? "ok" : "no"}">${correct ? "Riktig" : "Feil"}</div>
        <p>${it.e}</p>
      </div>`;
  }
  const last = session.i === session.items.length - 1;
  document.getElementById("navSlot").innerHTML =
    `<button class="btn" id="nextBtn">${last ? "Se oppsummering →" : "Neste →"}</button>`;
  document.getElementById("nextBtn").addEventListener("click", next);
}

function pick(k) {
  const it = session.items[session.i];
  const d = dom(it.d);
  session.answered = true;
  session.lastPick = k;
  const correct = k === it.c;
  if (correct) session.correctCount++;
  session.log.push({ d: it.d, correct });
  stats[d.id].seen++;
  if (correct) stats[d.id].correct++;
  saveStats();
  revealAnswer(k);
  persistSession();
}

function next() {
  if (session.i < session.items.length - 1) {
    session.i++;
    session.answered = false;
    session.lastPick = null;
    persistSession();
    renderQuestion();
  } else {
    timerFreeze();
    clearSavedSession();
    renderSummary();
  }
}

function renderSummary() {
  const total = session.items.length;
  const pct = Math.round((100 * session.correctCount) / total);
  // per-domain breakdown for this session
  const byDom = {};
  DOMAINS.forEach((d) => (byDom[d.id] = { seen: 0, correct: 0 }));
  session.log.forEach((l) => {
    byDom[l.d].seen++;
    if (l.correct) byDom[l.d].correct++;
  });
  const practiced = DOMAINS.filter((d) => byDom[d.id].seen > 0);
  // weakest practiced domain
  let weak = null,
    wv = 2;
  practiced.forEach((d) => {
    const r = byDom[d.id].correct / byDom[d.id].seen;
    if (r < wv) {
      wv = r;
      weak = d;
    }
  });
  // Exam-sim total time vs target (count-up clock)
  const examTime =
    mode === "exam"
      ? `<p class="resume-meta">⏱ Total tid: ${fmtClock(session.elapsedMs || 0)} · ${(session.elapsedMs || 0) <= SECS_PER_Q * 1000 * total ? "innenfor måltid ✓" : "over måltid (" + fmtClock(SECS_PER_Q * 1000 * total) + ")"}</p>`
      : "";

  app.innerHTML = `
    <div class="eyebrow">Økt fullført</div>
    <h1>${session.correctCount} / ${total} riktige</h1>
    <p class="lede">${pct >= 80 ? "Solid. Det er rundt nivået du vil ha med inn i en proktorert prøve." : pct >= 60 ? "På vei. Repeter de svake domenene før du går videre." : "Tidlig. Ta de svakeste domenene ett om gangen i øvingsmodus."}</p>
    ${examTime}

    <div class="card">
      <h2>Denne økten · per domene</h2>
      <div class="sumgrid">
        ${practiced
          .map((d) => {
            const s = byDom[d.id];
            const r = Math.round((100 * s.correct) / s.seen);
            return `
          <div class="sumrow">
            <span class="nm">${d.short}</span>
            <span class="track"><span class="trackfill" style="width:${r}%; background:${d.hex}"></span></span>
            <span class="sc">${s.correct}/${s.seen}</span>
          </div>`;
          })
          .join("")}
      </div>
      ${weak ? `<div class="focusnote">Neste fokus: <b>${weak.name}</b>. Det var det svakeste denne økten — kjør det isolert i øvingsmodus til du treffer jevnt.</div>` : ""}
    </div>

    <div class="btnrow">
      <button class="btn" id="againBtn">Ny økt →</button>
      <button class="btn ghost sm" id="homeBtn">Til oversikt</button>
    </div>
  `;
  document.getElementById("againBtn").addEventListener("click", async () => {
    buildSession();
    await persistSession();
    render();
  });
  document.getElementById("homeBtn").addEventListener("click", () => {
    session = null;
    render();
  });
}

/* ---------- Theme toggle ---------- */
const THEME_KEY = "cca:theme:v1";
const MOON_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
const SUN_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';

function currentTheme() {
  return document.documentElement.getAttribute("data-theme") === "dark"
    ? "dark"
    : "light";
}

function applyTheme(theme) {
  const dark = theme === "dark";
  if (dark) document.documentElement.setAttribute("data-theme", "dark");
  else document.documentElement.removeAttribute("data-theme");
  const btn = document.getElementById("themeToggle");
  if (btn) {
    btn.innerHTML = dark ? SUN_SVG : MOON_SVG; // sun while dark (click → light); moon while light
    btn.setAttribute("aria-pressed", String(dark));
    const label = dark ? "Bytt til lys modus" : "Bytt til mørk modus";
    btn.setAttribute("aria-label", label);
    btn.setAttribute("title", label);
  }
}

function setupThemeToggle() {
  // Sync the button (icon/aria) with whatever the <head> script already set.
  applyTheme(currentTheme());
  const btn = document.getElementById("themeToggle");
  if (btn) {
    btn.addEventListener("click", () => {
      const next = currentTheme() === "dark" ? "light" : "dark";
      applyTheme(next);
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch (e) {
        /* storage blocked */
      }
    });
  }
  // Live-follow OS changes ONLY while no explicit choice is stored.
  if (window.matchMedia) {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e) => {
      let hasChoice = false;
      try {
        hasChoice = !!localStorage.getItem(THEME_KEY);
      } catch (_) {}
      if (!hasChoice) applyTheme(e.matches ? "dark" : "light");
    };
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else if (mq.addListener) mq.addListener(onChange); // older Safari
  }
}

/* ---------- Exam timer (count-up with target; exam mode only) ---------- */
const SECS_PER_Q = 120; // target time budget per question
let timerRunningSince = null; // ms timestamp while ticking, else null (NOT persisted)
let timerInterval = null;
let timerTickCount = 0;

function examTargetMs() {
  return SECS_PER_Q * 1000 * (session ? session.items.length : 0);
}
function fmtClock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
function renderTimerInto(el) {
  const elapsed = session.elapsedMs || 0;
  el.textContent = `⏱ ${fmtClock(elapsed)} / ${fmtClock(examTargetMs())}`;
  el.classList.toggle("over", elapsed >= examTargetMs());
}
function timerTick() {
  if (!session || timerRunningSince == null) return;
  const now = Date.now();
  session.elapsedMs = (session.elapsedMs || 0) + (now - timerRunningSince);
  timerRunningSince = now;
  const el = document.getElementById("examTimer");
  if (el) renderTimerInto(el);
  if (++timerTickCount % 5 === 0) persistSession(); // light periodic save (~5s)
}
function timerEnsureRunning() {
  if (mode !== "exam" || !session) return;
  if (timerRunningSince == null) timerRunningSince = Date.now();
  if (timerInterval == null) timerInterval = setInterval(timerTick, 1000);
}
function timerFreeze() {
  if (timerRunningSince != null && session) {
    session.elapsedMs =
      (session.elapsedMs || 0) + (Date.now() - timerRunningSince);
  }
  timerRunningSince = null;
  if (timerInterval != null) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  if (session) persistSession();
}

/* ---------- Clear-progress button ---------- */
function setupClearButton() {
  const btn = document.getElementById("clearBtn");
  if (!btn) return;
  btn.addEventListener("click", () => {
    if (
      confirm(
        "Nullstille all fremgang (mestring per domene)? Dette kan ikke angres. Pauset økt og tema beholdes.",
      )
    ) {
      resetStats(); // clears stored stats + re-renders
    }
  });
}

/* ---------- boot ---------- */
setupThemeToggle();
setupClearButton();
(async function () {
  await loadStats();
  await loadSavedSession();
  render();
})();

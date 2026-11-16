# Direct Orchestration and Supervision Return Implementation Plan

> **Execution:** Implement this plan task-by-task following RED → GREEN → REFACTOR. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Maintenir Firstmate comme responsable du lancement, du suivi et de l’arbitrage des workers, et vérifier leur retour par la supervision existante après interruption.

**Architecture:** Renforcer le contrat du coordinateur chez ses propriétaires actuels et conserver le contrat worker déjà émis par `fm_brief_worker_role`. Réutiliser les tâches enregistrées, le watcher, la file durable et son acquittement ; aucun nouveau contrôle d’accès ou moteur de supervision. Ce lot modifie les instructions et ajoute une couverture de caractérisation ; il ne promet pas l’interception de tous les outils natifs des harnais.

**Tech Stack:** Markdown, JSON et Bash ; runner `bin/fm-test-run.sh`, fixtures `tests/wake-helpers.sh`, lint canonique `bin/fm-lint.sh` et contrôle documentaire existant ; aucune dépendance nouvelle.

**Spec:** La section [Spécification de cette livraison](#spécification-de-cette-livraison) contient les exigences de ce plan ; lire aussi [le contrat Firstmate](../../AGENTS.md), sections 7 et 8. Les mécanismes de retour restent définis dans [l’architecture de supervision](../architecture.md) et les scripts qu’elle référence.

## Global Constraints

- « MDD reste facultatif. »
- « Aucune extension d’adaptateur ni ajout de harnais dans cette livraison. »
- « Aucun nouveau moteur, journal, stockage ou schéma de tâche. »
- « Préserver les profils, les autorités, les secondmates mandatés et les aides spécialisées explicitement autorisées. »
- « Ne modifier ni l’installation quotidienne ni un projet métier pendant l’implémentation. »
- Les vérifications mécaniques et les simulations ne prouvent pas le comportement d’un modèle ou d’un harnais réel.
- Pour les instructions seules, appliquer l’exception documentaire au RED ; pour les comportements existants, commencer par une caractérisation verte. Tout défaut de production découvert nécessite un RED pertinent avant sa correction, dans un périmètre réexaminé.
- Commentaires de code uniquement nécessaires et courts ; conserver les outils et conventions du dépôt.

## Review Focus

- Une demande de revue ou de deux corrections ne doit pas promouvoir l’implémenteur en coordinateur : scénario `direct-review-and-corrections`, tâche 1.
- Un lancement refusé ne doit pas provoquer un changement silencieux de profil ou une délégation par intermédiaire : scénario `unsupported-dispatch`, tâche 1.
- Un projet sans MDD doit conserver le même propriétaire de lancement et de retour : scénario `classic-project`, tâche 1.
- Un secondmate mandaté et une aide spécialisée autorisée doivent rester utilisables : scénario `authorized-assistance`, tâche 1.
- Deux résultats arrivés pendant une interruption doivent conserver leur attribution, rester rejouables avant acquittement et ne pas se multiplier après traitement : `test_two_direct_returns_survive_restart_until_ack`, tâche 2.

---

## Spécification de cette livraison

Firstmate, ou le secondmate dont la charte couvre effectivement le travail, conserve la responsabilité des lancements et des rapports. Un worker qui demande une revue ou une correction remet son résultat ou son blocage à son superviseur ; celui-ci choisit et lance l’affectation suivante dans l’autorité existante. Une demande technique ne constitue pas une autorisation de transformer ce worker en lanceur d’autres implémenteurs ou en collecteur de leurs rapports. Une assistance spécialisée explicitement autorisée reste possible sans transfert implicite de cette responsabilité.

Si un parcours demandé n’est pas pris en charge, exposer le refus concret et appliquer uniquement un repli déjà autorisé par les règles existantes. Préserver les profils, les autorités, les secondmates mandatés et les aides spécialisées explicitement autorisées. Ne pas changer silencieusement le backend, le harnais, le modèle ou le compte, ni contourner le refus en changeant le rôle du worker. Les replis actuellement documentés pour une configuration de runtime non vérifiée ne sont pas supprimés par ce lot.

Après un lancement enregistré, suivre le protocole de supervision émis pour le harnais du superviseur. Résultats, erreurs et blocages restent attribués à leur tâche ; une interruption avant acquittement conserve les événements pour reprise. Les scripts existants gardent la mécanique de consommation et de déduplication.

MDD reste facultatif. Aucune extension d’adaptateur ni ajout de harnais dans cette livraison. Aucun nouveau moteur, journal, stockage ou schéma de tâche. Ne modifier ni l’installation quotidienne ni un projet métier pendant l’implémentation. Le garde MCP, son branchement dans les harnais, les permissions des outils natifs et la combinaison T3/OpenCode sont hors périmètre.

## Base de référence et fichiers

Base de référence : `e4905d73b40c3237ac4f4221c7145d172984f888`. Utiliser un checkout de développement et vérifier sa base avant exécution ; préserver les changements existants et ne pas travailler sur la branche publiée. Cette référence sert aussi à examiner le diff complet après les commits des deux tâches. Les détails locaux du checkout et les traces de diagnostic restent dans le rapport privé d’exécution.

| Fichier | Responsabilité et changement prévu |
| --- | --- |
| `AGENTS.md`, section 7, « Dispatch and supervision handoff » | Règle courte, toujours chargée, sur la propriété des lancements et rapports. |
| `.agents/skills/harness-adapters/references/common/dispatch.md` | Procédure de réaction au besoin d’un autre worker et au refus du parcours demandé. |
| `.agents/skills/harness-adapters/evals/evals.json` — nouveau | Quatre scénarios de jugement, au format d’évaluation déjà utilisé par `ship-landing`. Aucun runner nouveau. |
| `docs/documentation-audiences.json` | Classification de ce plan comme `maintainer-architecture`. |
| `tests/fm-wake-daemon-lifecycle-e2e.test.sh` | Une caractérisation intégrée du retour de deux tâches ; sélection ciblée `FM_TEST_ONLY` suivant les autres suites. |
| `bin/fm-dod-lib.sh`, `bin/fm-spawn.sh`, `bin/fm-watch.sh`, `bin/fm-wake-drain.sh`, `bin/fm-supervise-daemon.sh` | Propriétaires existants utilisés ou lus ; aucune modification planifiée. |

## Task 1: Conserver la coordination chez Firstmate

**Files:**

- Modify: `AGENTS.md:210`, dans « Dispatch and supervision handoff ».
- Modify: `.agents/skills/harness-adapters/references/common/dispatch.md:20`, section « Owners ».
- Create: `.agents/skills/harness-adapters/evals/evals.json`.
- Modify: `docs/documentation-audiences.json`, tableau `surfaces`.
- Read: `bin/fm-dod-lib.sh:153`, contrat worker existant ; `.agents/skills/harness-adapters/SKILL.md:13`, replis existants.

**Interfaces:**

- Consumes: `fm_brief_worker_role <state-dir> <task-id> <code-root>`, qui émet déjà le rôle worker ; modes de lancement et règles de supervision existants.
- Produces: une instruction du coordinateur et quatre cas JSON `{id, name, prompt, expected_output, expectations, files}`, sous `{skill_name: "harness-adapters", evals: [...]}` ; aucune API d’exécution nouvelle.

- [ ] **Step 1: Préparer la branche de travail.** Dans un checkout de développement, vérifier HEAD et les modifications, puis créer une branche dédiée depuis la base de référence. Préserver les changements existants ; ne pas écraser de branche ni modifier l’installation quotidienne.

- [ ] **Step 2: Écrire les quatre scénarios d’évaluation.** Utiliser les noms de Review Focus avec les identifiants 1 à 4 ; chaque scénario est en lecture seule et interdit tout lancement pendant l’évaluation. `direct-review-and-corrections` attend un lancement et un retour détenus par Firstmate, avec remplacement/revue selon le cycle existant ; `unsupported-dispatch` attend un refus explicite et uniquement un repli déjà autorisé ; `classic-project` refuse l’invention d’un contrat MDD ; `authorized-assistance` conserve la charte et les autorisations explicites sans délégation générale implicite.

```python
assert data["skill_name"] == "harness-adapters"
assert [case["id"] for case in data["evals"]] == [1, 2, 3, 4]
assert {case["name"] for case in data["evals"]} == {
    "direct-review-and-corrections", "unsupported-dispatch",
    "classic-project", "authorized-assistance",
}
assert all(case["expectations"] and case["files"] == [] for case in data["evals"])
```

- [ ] **Step 3: Préciser la règle du coordinateur.** Ajouter à l’endroit indiqué, en anglais comme son propriétaire, cette instruction : “Keep worker dispatch and report arbitration with the supervising firstmate or a chartered secondmate; a review, correction, or unsupported launch does not authorize promoting a ship or scout into a launcher or report-collecting coordinator.” Conserver le contrat worker existant sans le recopier.

- [ ] **Step 4: Compléter la procédure existante.** Dans `dispatch.md`, préciser le comportement à adopter pour un besoin de revue/correction et pour un refus : examiner résultat et autorité, choisir le parcours déjà pris en charge, conserver le propriétaire du lancement et du rapport, et signaler toute décision de repli encore nécessaire. Préserver l’assistance spécialisée explicitement autorisée. Renvoyer aux sections 7 et 8 de `AGENTS.md` pour l’autorité et la supervision ; ne pas recopier les recettes de réveil ni modifier le repli documenté du skill principal.

- [ ] **Step 5: Classer ce plan.** Ajouter son chemin à `surfaces` avec `audience: "maintainer-architecture"`. Ce plan demandé porte sur les propriétaires et frontières du contrat ; les traces, chemins temporaires et détails du checkout restent dans le rapport privé. Ne pas créer une seconde politique documentaire.

- [ ] **Step 6: Vérifier le livrable documentaire.** Charger le JSON depuis `.agents/skills/harness-adapters/evals/evals.json` dans `data`, appliquer les assertions ci-dessus, puis exécuter `python3 -m json.tool .agents/skills/harness-adapters/evals/evals.json`. Après inclusion des nouveaux fichiers dans l’index de travail, exécuter `bash bin/fm-doc-audience-check.sh` ; attendre `fm-doc-audience-check: ok`. Relire les scénarios contre les instructions. Une structure JSON valide ne prouve pas le comportement d’un modèle ; aucune évaluation avec agents n’est lancée dans ce lot.

- [ ] **Step 7: Commit.** Inclure uniquement le plan, l’inventaire, les deux propriétaires d’instructions et les évaluations. Message : `docs: retain direct worker orchestration ownership`. Aucune publication.

## Task 2: Vérifier le retour durable de deux workers directs

**Files:**

- Modify/Test: `tests/fm-wake-daemon-lifecycle-e2e.test.sh:61`, près du parcours existant de retour après redémarrage, et sa liste d’exécution finale.
- Reuse: `tests/wake-helpers.sh`, `tests/lib.sh`.

**Interfaces:**

- Consumes: `fm_write_meta FILE FIELD...` pour les tâches de fixture ; `make_supercase NAME`, `run_watcher_once STATE FAKEBIN OUT`, `ack_handled_wakes STATE STDERR` déjà utilisés par cette suite.
- Consumes: CLI réels `FM_STATE_OVERRIDE=STATE bin/fm-watch.sh` et `bin/fm-wake-drain.sh [--ack-through SEQUENCE --recovery-generation GENERATION]` ; propriétaires réels `handle_wake REASON STATE` et `housekeeping STATE` du daemon, déjà importés par la suite.
- Produces: `test_two_direct_returns_survive_restart_until_ack()` et la sélection `FM_TEST_ONLY=<function>`, sans nouvelle interface de production.

- [ ] **Step 1: Écrire la caractérisation intégrée.** Créer deux tâches `direct-impl` et `direct-review` dans le même état temporaire, avec des endpoints distincts et des fichiers de résultat référencés depuis leurs statuts. Utiliser les fixtures existantes pour la frontière tmux uniquement. Faire arriver `done: report <rapport impl>` puis, entre deux exécutions du watcher, `failed: report <rapport revue>`. Collecter les deux réveils avant le premier drain.

Le premier drain doit présenter les associations complètes, afin qu’une permutation des rapports fasse échouer le test :

```bash
impl_event="direct-impl.status: done: report $impl_report"
review_event="direct-review.status: failed: report $review_report"
assert_contains "$(cat "$drain_out")" "$impl_event" "wrong implementation attribution"
assert_contains "$(cat "$drain_out")" "$review_event" "wrong review attribution"
```

Extraire les deux lignes TSV durables de type `signal` depuis le drain, sans les annotations, et les conserver dans `first_rows` : les colonnes sont époque, séquence, type, clé et payload. Traiter uniquement `direct-impl` avec le vrai `handle_wake`, en conservant `FM_ESCALATE_BATCH_SECS=3600` pour empêcher un envoi automatique pendant cette vérification. Exiger une entrée égale à `$impl_event` et aucune entrée égale à `$review_event` dans `$state/.subsuper-escalations`. Ne pas acquitter.

Relancer le drain dans un nouveau processus sur le même état, extraire les mêmes lignes dans `replayed_rows` et vérifier `cmp -s "$first_rows" "$replayed_rows"`. Les séquences, clés et payloads doivent être identiques. Les annotations de statut ont un curseur de présentation indépendant de l’ACK ; ne pas exiger qu’elles répètent les rapports déjà présentés. Les statuts et rapports restent accessibles par leurs chemins.

Rejouer le traitement des deux raisons `signal:` avec le vrai `handle_wake`. Vérifier l’effet persistant, avant puis après `housekeeping` :

```bash
[ "$(grep -Fxc -- "$impl_event" "$state/.subsuper-escalations")" -eq 1 ] || fail "implementation duplicated or lost"
[ "$(grep -Fxc -- "$review_event" "$state/.subsuper-escalations")" -eq 1 ] || fail "review duplicated or lost"
[ "$(wc -l < "$state/.subsuper-escalations" | tr -d ' ')" -eq 2 ] || fail "unexpected result digest"
```

Conserver une copie du buffer après le rejeu et la comparer avec le buffer après `housekeeping`, afin d’interdire toute entrée supplémentaire. Acquitter ensuite la séquence et la génération imprimées par le second drain et vérifier que les deux lignes acquittées ont quitté la file ; un drain ultérieur ne les présente plus. Ne pas exiger une sortie de drain totalement vide : d’autres décisions encore ouvertes ont leur propre contrat.

- [ ] **Step 2: Exécuter le cas ciblé.** Ajouter le sélecteur `FM_TEST_ONLY` selon le modèle de `tests/fm-backend-t3code.test.sh:2731`, puis exécuter :

```bash
FM_TEST_ONLY=test_two_direct_returns_survive_restart_until_ack bash bin/fm-test-run.sh --jobs 1 tests/fm-wake-daemon-lifecycle-e2e.test.sh
```

Attendre la ligne `ok -` du nouveau cas et `failed=0 skipped_gate=0`. Le comportement étant une caractérisation, GREEN initial est attendu et ne nécessite aucun RED artificiel. Si une assertion pertinente échoue, conserver le défaut reproduit et arrêter cette tâche avant toute correction de production hors périmètre ; ne pas affaiblir l’assertion ni copier la logique du watcher dans le test.

- [ ] **Step 3: Vérifier et simplifier la couverture.** Exécuter les suites pertinentes :

```bash
bash bin/fm-test-run.sh --jobs 1 tests/fm-wake-daemon-lifecycle-e2e.test.sh tests/fm-wake-drain-open-decisions.test.sh
bash bin/fm-lint.sh tests/fm-wake-daemon-lifecycle-e2e.test.sh
git diff --check
```

Attendre zéro échec et zéro omission ; le lint utilise sa version épinglée déjà installée. Réutiliser le test existant `test_routine_then_terminal_after_restart` pour le retour pendant l’arrêt du watcher et la suite des décisions ouvertes pour les blocages ; ne pas les dupliquer. Si le nouveau scénario reproduit exactement un cas existant, enrichir celui-ci au lieu de garder deux parcours équivalents.

- [ ] **Step 4: Commit.** Inclure uniquement la suite modifiée. Message : `test: cover direct worker return replay across supervision restart`.

## Validation et livraison

La validation locale vérifie le contrat écrit, les fichiers d’évaluation et le retour mécanique de tâches enregistrées. La fixture du nouveau test commence avec des tâches enregistrées ; elle ne prouve pas un lancement réel ni la décision d’un orchestrateur LLM. Les lancements déjà couverts et les résultats de diagnostic restent des preuves distinctes, sans les présenter comme un unique essai réel complet.

Un essai ultérieur avec un superviseur et des workers réels doit observer : lancement direct suivi, besoin de revue renvoyé à Firstmate, affectation suivante décidée par Firstmate, puis reprise après résultat ou blocage. Cet essai nécessite un projet et une autorisation distincts ; ne pas le lancer implicitement. Tant qu’il n’a pas eu lieu, conserver explicitement cette incertitude comportementale.

L’exécution prévue est directe et séquentielle, sans sous-agents. Les checkpoints manuels restent possibles à la demande ; une exécution déléguée exige une autorisation explicite. Publication, nouvelle version du fork et bascule quotidienne ne sont pas comprises dans ce plan. Après les deux tâches et leurs commits, examiner le diff complet depuis la base de référence :

```bash
git diff --stat e4905d73b40c3237ac4f4221c7145d172984f888 HEAD
git diff e4905d73b40c3237ac4f4221c7145d172984f888 HEAD
git diff --check e4905d73b40c3237ac4f4221c7145d172984f888 HEAD
git status --short
```

Présenter ce diff de branche, les commandes réellement exécutées et les limites. Un simple `git diff` après commit ne constitue pas cette revue. Ne pas déclarer résolus les contournements MCP ou la couverture de tous les harnais.

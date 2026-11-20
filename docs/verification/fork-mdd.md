# Qualification du fork et du raccordement MDD

Le [document de conception](../design/fork-mdd.md) décrit les décisions et les limites fonctionnelles. Ce document rassemble les preuves de qualification et les commandes de renouvellement.

## Mise à jour du 6 novembre 2026

La branche candidate `65a9a51f099e+fork-3` fusionne le commit officiel `65a9a51f099e91c5e2d05c9ae9c3d5e493d51762` dans `2911a3bb6dd1+fork-2` au commit `11770b1f7f3f17b36b22639d131df161d9895819`. Les preuves d'octobre ci-dessous décrivent les versions antérieures.

- Le vrai CLI MDD valide la copie figée, le passage à une revue neuve et la protection du contenu examiné. La fusion d'une PR MDD épingle le commit du worktree accepté. Si une mise à jour de la branche distante change ce commit, la fusion exige une nouvelle validation.
- Les tests de contrôle et de supervision distinguent la preuve d'arrêt de la génération courante des pipelines et sources indépendantes. Le test de liveness tmux vérifie Pi sous Bun avec un véritable groupe de processus et des exécutables de test.
- Les tests de mise à jour distinguent les branches épinglées de `config/self-update-source`. Une synchronisation vers un commit épinglé refuse une divergence même lorsque le contenu de la cible est identique. La commande distante qui reçoit un SHA explicite applique ce même refus.
- Le verdict GitHub d'une branche de version exige la réussite de tous ses jobs obligatoires, dont celui qui charge le bundle externe au SHA qualifié. Le contrôle local de partition couvre 332 scripts et 11 groupes séquentiels. La qualification GitHub, les pilotes Codex et Pi sur tmux et la bascule sont des étapes distinctes.

## Distribution externe

MDD `v0.4-experimental` est testé depuis le commit `71a3d3570d5dd04992f16dfff617bb31090d7732` de `abdwhb-png/agent-tools`. La qualification utilise son vrai CLI généré, les exemples de cette même distribution et Node `v24.18.0`. Aucun bundle ni `node_modules` MDD n'est embarqué dans FirstMate. Le test de transport simule également des exécutables CLI défaillants pour vérifier leurs erreurs de sortie et de JSON.

```sh
export FM_TEST_MDD_BUNDLE=/absolute/path/to/qualified/mission-driven-dev
bin/fm-test-run.sh tests/fm-mdd.test.sh
FM_TEST_ONLY=test_mdd_prepared_start_and_fresh_reviewer bin/fm-test-run.sh tests/fm-control-relaunch.test.sh
```

Le job CI `Qualified external MDD interface` acquiert cette distribution au commit fixé et exécute ces contrôles. Les autres lanes peuvent omettre le bundle et signalent explicitement ce skip. Ce skip ne constitue jamais une qualification MDD.

## Couverture ciblée

| Référence | Frontière et scénarios |
| --- | --- |
| VT1 | `fm-control`, `fm-crew-state`, gardes et watcher : preuve d'arrêt de la bonne génération, activité indépendante, pause et inconnus conservateurs, échec de publication, changement de génération pendant l'arrêt. Les tests importent les propriétaires réels et simulent les frontières du terminal et des pipelines. |
| VT2 | `fm-spawn --prepare` : worktree du projet demandé, documents non commités, aucune copie de changements étrangers, aucun agent, aucune alerte artificielle, refus du batch et conservation du bundle après échec de préparation. |
| VT3 | Bundle du projet prioritaire, distribution inconnue refusée, copie stable malgré mise à jour/suppression de la source, copie altérée refusée, Node indisponible, erreur CLI et JSON incohérent. |
| VT4 | Deux paquets dans la même tâche et la même identité d'implémentation, refus d'une double affectation, vérification de l'affectation et du brief courant, refus d'un état/journal incohérent, aucun retour de paquet accepté comme livraison. |
| VT5 | Remplacement de l'implémenteur par un réviseur neuf, refus de réutiliser son identité, auto-acceptation refusée, déclaration de rapport incomplet refusée, contenu et preuves modifiés invalidant l'acceptation, accord de livraison distinct, No-Mistakes refusé sans accord enregistré et après acceptation finale. |
| VT6 | Branche installée conservée, secondmates locaux liés et indépendants ciblant le commit installé, transmission du SHA aux routes distantes, données privées conservées et retour à une version précédente avec divergence explicitement signalée. |

Le parcours de contenu inclut un lien symbolique cassé, des fichiers non suivis, une preuve externe modifiée et un rapport final altéré. L'enregistrement administratif d'un résultat MDD dans le worktree n'invalide pas à lui seul le contenu examiné. La livraison exige ensuite un worktree enregistré dans Git et les conditions du mode de livraison existant.

## Validation locale et limites

Lors de la qualification initiale de `fork-1`, les dix suites suivantes ont terminé avec un code de sortie nul via `bin/fm-test-run.sh`, sans nouveau framework :

| Groupe | Suites complètes exécutées |
| --- | --- |
| Contrôle et retours | `tests/fm-control.test.sh`, `tests/fm-control-relaunch.test.sh`, `tests/fm-brief.test.sh`, `tests/fm-dod-lib.test.sh`, `tests/fm-pr-check-security.test.sh` |
| Versions et gardes | `tests/fm-update.test.sh`, `tests/fm-secondmate-sync.test.sh`, `tests/fm-tangle-guard.test.sh`, `tests/fm-turnend-guard.test.sh` |
| MDD réel | `tests/fm-mdd.test.sh`, avec la distribution externe identifiée ci-dessus |

Après les dernières corrections, le parcours ciblé Codex/Pi de `fm-control-relaunch` a aussi vérifié le refus d'un second démarrage, la relance du même paquet avec conservation du travail non commité et le remplacement par un réviseur neuf. Les cas ciblés de `fm-crew-state` ont vérifié la conservation de la supervision d'un pipeline actif après arrêt de l'agent et le traitement d'un pipeline terminé comme candidat MDD. Les cas ciblés du watcher couvrent la génération arrêtée et la tâche préparée sans agent. Ces exécutions ciblées ne constituent pas une exécution complète des suites `fm-crew-state` et `fm-watch-triage`.

`bin/fm-lint.sh` a réussi avec ShellCheck `0.11.0` et actionlint `1.7.12`, versions épinglées par le dépôt et installées temporairement après autorisation. ShellCheck a contrôlé les fichiers shell modifiés en mode local et actionlint les trois workflows. `bin/fm-doc-audience-check.sh` a validé la documentation et les liens locaux. `bin/fm-test-run.sh --check-coverage` a confirmé la partition des 254 scripts de tests. Ces contrôles ne sont pas une exécution de toutes les partitions CI.

Les tests de lancement Codex/Pi et de passage à la revue utilisent le vrai propriétaire de lancement et un terminal simulé. Les pilotes réels ci-dessous complètent cette preuve. La déclaration de rapport complet reste une responsabilité explicite du coordinateur P1 après réception effective du résultat.

La CI hébergée de cette qualification initiale portait sur `fork-1`, avec les lanes macOS et Herdr et le test de structure Ruby `tests/fm-ci-workflow.test.sh`. Pour chaque nouvelle version, la qualification exige la réussite de tous les jobs requis sur le commit destiné à l'installation. [Résultats de la CI de fork-1](https://github.com/abdwhb-png/firstmate/actions/workflows/ci.yml?query=branch%3A2911a3bb6dd1%2Bfork-1).

R1 est indépendant du raccordement MDD et ne modifie pas la capacité de projet. Les tests ne prouvent pas un confinement des terminaux, l'authenticité cryptographique des instructions utilisateur ni une migration automatique de missions vers une autre distribution. Warriors Trading et No-Mistakes sont hors des opérations effectuées pour cette qualification.

## Corrections et pilotes réels du 14 octobre 2026

Les commits `b7d5e364` (supervision après arrêt) et `625d64c7` (identité Pi partagée) corrigent les deux défauts reproduits en usage réel. Les régressions ont échoué avant correction puis réussi. Le premier conserve un résultat inconnu pour les erreurs ou délais dépassés et reconnaît le diagnostic exact « dépôt non initialisé » avec son code de sortie 1. Le second partage l’identité de l’entrée Pi sous Bun entre la présence du processus, la détection du harness et la reconnaissance du champ de saisie. Les contre-exemples Bun, chemins contenant des espaces et champs non attribués restent couverts.

Les suites complètes suivantes ont passé via le runner existant : `fm-crew-state`, `fm-backend-herdr`, `fm-harness-precedence`, `fm-tmux-agent-liveness`, `fm-composer-ghost` et `fm-harness-liveness-drift-live-e2e`. Ce dernier a exercé les exécutables installés Codex 0.162.1 et Pi 1.1.0 sans prompt. Les autres harnesses absents sont signalés, sans qualification implicite. ShellCheck 0.11.0 a passé sur les scripts modifiés avec analyse étendue, actionlint 1.7.12 sur les trois workflows et le contrôle documentaire sur les surfaces maintenues. Le test Herdr simule ses frontières externes et ne constitue pas un pilote MDD Herdr.

Le projet jetable reste une fonction JavaScript `greet` sans dépendances, au même commit de départ. Chaque harness reçoit une tâche et un worktree, conserve le travail non commité, puis remplace l’implémenteur par un réviseur neuf dans cette même tâche. Le bundle MDD qualifié ci-dessus est copié et son vrai CLI valide l’état. Les modèles sélectionnés par les installations sont GPT-6.1-Sol pour Codex et `ocg/go-deepseek-v4.1-flash` pour Pi.

| Configuration | Résultat observé |
| --- | --- |
| Codex 0.162.1 / tmux / Linux-WSL | Implémentation avec RED puis trois tests GREEN, rapport complet, acceptation du paquet, arrêt confirmé, revue en nouvelle session sans historique, acceptation finale et état MDD `completed`. |
| Pi 1.1.0 / Bun / tmux / Linux-WSL | Même implémentation et tests, rapport complet, acceptation du paquet, arrêt confirmé, nouvelle session de revue et rapport complet. Le contrôle refuse ensuite `reviewed content changed during review`. L’état reste `validating` avec interruption `blocked`, validé par le CLI MDD. |
| R1 après les arrêts des deux pilotes | `stopped_gen` correspond à `spawn_gen`, `in_flight=0`, `needed=false`. Les métadonnées, worktrees, rapports et notifications sont conservés. |

La limite Pi vient des fichiers non ignorés produits par ses extensions : des journaux `.pi-lens-probe-home/` changent pendant la revue et `.pi/artifacts/session-cron.lock` change à son démarrage. La garde d’empreinte inclut ces fichiers et refuse donc l’acceptation, même si les deux fichiers de code sont restés identiques. Aucun résultat accepté n’a été fabriqué et aucune exclusion de fichiers n’avait été ajoutée lors de ce pilote. La configuration Pi utilisée n’est pas qualifiée de bout en bout. La correction configurable décrite ci-dessous doit encore être suivie d’une nouvelle revue Pi réelle.

Ces pilotes ne qualifient pas la progression de plusieurs paquets avec le même implémenteur, la reprise après interruption, les courses concurrentes ni l’orchestration de Warriors Trading. Aucun pipeline No-Mistakes n’a été lancé. Les lectures de son statut par la supervision ne sont pas des exécutions de pipeline. Les agents des pilotes sont arrêtés. Les preuves détaillées restent dans le rapport de qualification local extérieur aux données privées de FirstMate.

## Exclusions Git configurables, 14 octobre 2026

Le lancement réutilise désormais les exclusions Git locales au dépôt pour appliquer [config/git-excludes](../configuration.md#git-exclusions-configgit-excludes). La suite `fm-gitignore-config` exerce le vrai `fm-spawn` avec Git et des worktrees réels, en simulant uniquement le backend et les agents. Elle vérifie la configuration privée, les valeurs par défaut sans configuration Git utilisateur, le remplacement et le retrait des règles, leur héritage par les secondmates, les négations Git, les fichiers suivis et la conservation des exclusions manuelles lors des erreurs.

La suite `fm-mdd` passe avec le bundle externe v0.4-experimental qualifié ci-dessus. Elle importe le raccordement réel et appelle le vrai validateur du bundle. Le cas ajouté produit `ok - ignored runtime writes permit review, changed source and ignored referenced evidence still refuse` : une écriture de télémétrie ignorée permet l’enregistrement du rapport, tandis qu’un nouveau fichier source ou une preuve référencée pourtant ignorée le fait refuser. Le calcul d’empreinte MDD n’a pas été modifié. Ces résultats déterministes ne constituent pas une nouvelle qualification Pi de bout en bout.

## 2026-11-15 — Livraisons v0.5 et piles Git

Le [raccordement des livraisons](../design/fork-mdd.md#livraisons-et-pr-empilées) reconnaît une seconde distribution exacte, issue du checkout de travail Agent Stack v0.5-experimental. Son identité est une empreinte de fichiers locaux, pas un commit publié ; les missions v0.4 conservent leur distribution et leur cycle. Le validateur v0.5 exige une frontière de livraison dans les états actifs, les examens de paquets et de retours acceptés, puis une preuve d'intégration avant clôture PR. Bun 1.3.14 passe 48 tests et 588 assertions ; TypeScript 7.0.2 strict et la comparaison de distribution passent. Les tests du candidat état/journal vérifient le refus avant publication avec le même validateur propriétaire.

`tests/fm-mdd-delivery.test.sh` utilise le vrai bundle v0.5, le raccordement importé et les commandes réelles de contrôle et d'enregistrement PR. Le scénario crée un dépôt Git nu et trois branches dépendantes : correction du parent, renouvellement d'autorité sans écrasement, fusion squash, rebase des descendants, conflit conservant le candidat et la branche distante, puis reprise après échec du reciblage distant. Il vérifie l'invalidation de l'acceptation, une nouvelle revue indépendante simulée, la clôture après intégration, la reconstruction de l'archive et les refus de nettoyage en présence d'un descendant ou de travail supplémentaire. Un appel refusé par le garde existant ne crée aucune archive MDD. Une clôture terminale alternative reste distincte d'une intégration réussie et nécessite l'autorité de disposition existante pour son nettoyage forcé.

Le passage canonique local des 18 scénarios sort à zéro, sans qualification omise. Les régressions couvrent les trois états terminaux alternatifs, une autre branche ou une tête détachée, une cible PR divergente avant transport et à la reprise, les destinations effectives de push et les réécritures Git, une PR étrangère, un parent absent de la cible réécrite, un lien symbolique au nom de temporaire prévisible, le journal sans saut de ligne final, une clôture invalide et l'échec synchrone de publication de l'état. L'archive retient les anciens verdicts et les preuves de démonstration avec vérification de leurs octets. `tests/fm-mdd.test.sh` passe avec le vrai bundle v0.4 et vérifie aussi son nettoyage administratif sans worktree ; `tests/fm-demonstration.test.sh` passe avec le propriétaire de conservation étendu.

`tests/fm-mdd.test.sh` exerce également le vrai `fm-spawn --prepare` puis `fm-teardown` sur un worktree Git natif, avec une frontière Treehouse qui refuse les copies non gérées. Le nettoyage refuse un worktree verrouillé et conserve son enregistrement ; après déverrouillage, il retire la copie et son inscription Git sans modifier le checkout principal. Cette régression a échoué sur l'appel Treehouse avant la correction du chemin de nettoyage.

La forge est simulée dans ce scénario ; Git et ses écritures restent réels dans des répertoires jetables. Une lecture authentifiée distincte, sans mutation, confirme le schéma des champs `gh pr view` utilisés, et l'aide du CLI confirme le reciblage `gh pr edit --base`. Cela ne qualifie ni un repositionnement distant réel, ni la reprise d'un agent réel, ni une nouvelle combinaison de harness/backend. Aucun pilote avec agents, changement de projet métier, publication ou bascule d'installation n'a été effectué.

Pour vérifier les deux contrats ensemble, fournir l'ancien bundle qualifié dans `FM_TEST_MDD_BUNDLE`, le checkout v0.5 exact dans `FM_TEST_MDD_DELIVERY_BUNDLE`, puis lancer `bash bin/fm-test-run.sh --jobs 1 tests/fm-mdd.test.sh tests/fm-mdd-delivery.test.sh`. Sans bundle externe, ces suites annoncent explicitement leur absence de qualification. Les scénarios comportementaux ajoutés au skill sont préparés, sans exécution de modèles ni revendication d'amélioration mesurée.

## 2026-11-16 - Vérification locale des workflows facultatifs

Le candidat conserve les parcours classiques sans MDD et l’activation indépendante de la démonstration. Le contrôle commun refuse les erreurs d’espaces sur le diff complet au stade prêt et les déclare au stade brouillon ; le test classique utilise un exécutable Node qui refuse tout appel. Les régressions de lancement vérifient les arguments et métadonnées du modèle et de l’effort, avec remise à zéro lors d’un changement de harness.

Le vrai bundle v0.4 reste utilisé pour les suites historiques et v0.5 pour les 19 scénarios de livraison existants. Quatre scénarios v0.6 supplémentaires couvrent l’autorité de brouillon, le refus des références externes, les exports autonomes et un cycle accepté complet avec réconciliation, nouvelle revue, intégration, archive et contrôles de nettoyage. Le test du rapport dans le projet vérifie aussi que sa création ne modifie pas les sources examinées et que la modification d’un ancien rapport périme l’acceptation. Ces scénarios sont exécutés par `tests/fm-mdd-delivery.test.sh` lorsque son bundle v0.6 est fourni avec `FM_TEST_MDD_PORTABLE_BUNDLE`.

Git et les CLI MDD sont réels ; forge et agents sont simulés. Cela ne qualifie aucun harness réel ni aucune opération distante. Les traces détaillées et l’empreinte exacte du bundle sont conservées dans le rapport de correction hors des données opérationnelles.

## 2026-11-16 — Préparation commune des PR et regroupement

Le contrôle de livraison exige un examen enregistré pour les nouvelles tâches PR/MR, indépendamment de MDD et de la démonstration. Les tests couvrent absence, correction, changement de commit/base/brief/présentation/preuve et échec atomique de publication. Les comparaisons de têtes et écritures liées au commit examiné passent sur les trois forges simulées ; les tâches historiques gardent leur contrat. Les suites ciblées de livraison, DoD, sécurité PR, fusion PR, relance, MDD, livraison MDD et démonstration ont chacune un passage complet réussi. Le cycle portable est également vérifié avec la copie figée v0.6 et la nouvelle distribution v0.7 ; ses règles et cas de regroupement évoluent sans changement de schéma. Les 50 tests du validateur, TypeScript strict et verify:dist passent.

Ces résultats utilisent Git réel et des frontières de forge et de harness simulées. Les nouvelles évaluations de skills sont préparées et structurellement vérifiées, sans exécution comparative de modèles. Aucun pilote, protocole distant supplémentaire, CI distante, publication ou bascule n’est qualifié par ces contrôles.

## 2026-11-20 - Orientation du projet (fork-7)

La branche `427056c4181c+fork-7` conserve la base officielle `427056c4181c41074ad24f051f79919330df0fa5`. Les vérifications locales du 19 novembre portent sur le [contrat d’orientation](../../AGENTS.md#intake-and-authority), les briefs émis et leur composition au lancement et à la reprise. Elles utilisent les vrais producteurs et Git ; les endpoints de workers sont simulés. La régression de composition a d’abord échoué sur l’absence de propriétaire de continuation, puis passé en conservant les instructions d’arrêt, le conflit ouvert et les briefs source.

La suite complète des briefs, les cas ciblés de livraison et de relance, le contrôle documentaire et ShellCheck 0.11.0 avec analyse étendue passent. Les commandes ciblées de renouvellement sont :

```sh
bin/fm-test-run.sh tests/fm-brief.test.sh
FM_TEST_ONLY=test_registered_delivery_review bin/fm-test-run.sh tests/fm-task-delivery.test.sh
FM_TEST_ONLY=test_project_conflict_respects_composed_wait_contract bin/fm-test-run.sh tests/fm-task-delivery.test.sh
FM_TEST_ONLY=test_relaunch_appends_the_progress_note_to_the_instructions bin/fm-test-run.sh tests/fm-control-relaunch.test.sh
bin/fm-doc-audience-check.sh
FM_LINT_JOBS=1 bin/fm-lint.sh bin/fm-brief.sh bin/fm-dod-lib.sh tests/fm-brief.test.sh tests/fm-task-delivery.test.sh
```

Le [catalogue d’évaluation](../../tests/fixtures/project-instructions-evals.json) couvre dix situations. Codex CLI 0.167.0 avec `gpt-6.1-sol`, effort `low`, a produit trois observations de référence déjà conformes, neuf observations candidates conformes et deux observations supplémentaires sur les briefs complets ship et ancien avec Waiting. Ces dernières distinguent l’arrêt du worker et la poursuite coordonnée du travail indépendant sans résolution prématurée du conflit. Les deux revues indépendantes concluent à l’absence de défaut restant et ont reconstitué les quatorze stdin à partir de leur assemblage conservé dans les preuves de tâche.

Ces évaluations portent sur du contexte fourni, sans appel d’outil par le modèle. Elles ne reproduisent pas l’incident utilisateur et ne qualifient ni une mission supervisée réelle ni le chargement natif des instructions dans tous les harnais. La reconstruction couvre le stdin et les options CLI, pas tout le contexte interne du harnais. La CI distante sur le commit publié et la bascule d’installation restent des vérifications distinctes.

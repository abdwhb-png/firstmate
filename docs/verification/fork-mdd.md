# Qualification du fork et du raccordement MDD

Date : 14 octobre 2026. Cible courante : candidate locale `2911a3bb6dd1+fork-2`, issue de `fork-1` au commit `40a6fb771af7f3013a241538080ae8519da84cb2`, base officielle `2911a3bb6dd1b41061fb4dc87738791bf78008f4`. Le [document de conception](../design/fork-mdd.md) possède les décisions et les limites fonctionnelles. Ce document possède les preuves de qualification et les commandes de renouvellement.

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

La CI hébergée complète a été exécutée sur la branche publiée, avec les lanes macOS et Herdr et le test de structure Ruby `tests/fm-ci-workflow.test.sh`. Les [résultats du workflow CI](https://github.com/abdwhb-png/firstmate/actions/workflows/ci.yml?query=branch%3A2911a3bb6dd1%2Bfork-1) sont la preuve de référence : la qualification exige la réussite de tous les jobs requis sur le commit effectivement publié et installé. Cette CI porte sur `fork-1`. La CI hébergée complète n’a pas été relancée pour la candidate locale `fork-2`, qui n’est ni publiée ni installée.

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

La limite Pi vient des fichiers non ignorés produits par ses extensions : des journaux `.pi-lens-probe-home/` changent pendant la revue et `.pi/artifacts/session-cron.lock` change à son démarrage. La garde d’empreinte inclut ces fichiers et refuse donc l’acceptation, même si les deux fichiers de code sont restés identiques. Aucun résultat accepté n’a été fabriqué et aucune exclusion de fichiers n’a été ajoutée pour masquer ce refus. La configuration Pi utilisée n’est pas qualifiée de bout en bout. La prochaine vérification doit établir le placement ou l’exclusion explicite de ces seuls artefacts d’exécution chez leur propriétaire, puis renouveler une revue indépendante sur un contenu stable.

Ces pilotes ne qualifient pas la progression de plusieurs paquets avec le même implémenteur, la reprise après interruption, les courses concurrentes ni l’orchestration de Warriors Trading. Aucun pipeline No-Mistakes n’a été lancé. Les lectures de son statut par la supervision ne sont pas des exécutions de pipeline. Les agents des pilotes sont arrêtés. Les preuves détaillées restent dans le rapport de qualification local extérieur aux données privées de FirstMate.

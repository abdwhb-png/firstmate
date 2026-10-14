# Qualification du fork et du raccordement MDD

Date : 14 octobre 2026. Cible : branche candidate `2911a3bb6dd1+fork-1`, base officielle `2911a3bb6dd1b41061fb4dc87738791bf78008f4`. Le [document de conception](../design/fork-mdd.md) possède les décisions et les limites fonctionnelles. Ce document possède les preuves de qualification et les commandes de renouvellement.

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

Les dix suites suivantes ont terminé avec un code de sortie nul via `bin/fm-test-run.sh`, sans nouveau framework :

| Groupe | Suites complètes exécutées |
| --- | --- |
| Contrôle et retours | `tests/fm-control.test.sh`, `tests/fm-control-relaunch.test.sh`, `tests/fm-brief.test.sh`, `tests/fm-dod-lib.test.sh`, `tests/fm-pr-check-security.test.sh` |
| Versions et gardes | `tests/fm-update.test.sh`, `tests/fm-secondmate-sync.test.sh`, `tests/fm-tangle-guard.test.sh`, `tests/fm-turnend-guard.test.sh` |
| MDD réel | `tests/fm-mdd.test.sh`, avec la distribution externe identifiée ci-dessus |

Après les dernières corrections, le parcours ciblé Codex/Pi de `fm-control-relaunch` a aussi vérifié le refus d'un second démarrage, la relance du même paquet avec conservation du travail non commité et le remplacement par un réviseur neuf. Les cas ciblés de `fm-crew-state` ont vérifié la conservation de la supervision d'un pipeline actif après arrêt de l'agent et le traitement d'un pipeline terminé comme candidat MDD. Les cas ciblés du watcher couvrent la génération arrêtée et la tâche préparée sans agent. Ces exécutions ciblées ne constituent pas une exécution complète des suites `fm-crew-state` et `fm-watch-triage`.

`bin/fm-lint.sh` a réussi avec ShellCheck `0.11.0` et actionlint `1.7.12`, versions épinglées par le dépôt et installées temporairement après autorisation. ShellCheck a contrôlé les fichiers shell modifiés en mode local et actionlint les trois workflows. `bin/fm-doc-audience-check.sh` a validé la documentation et les liens locaux. `bin/fm-test-run.sh --check-coverage` a confirmé la partition des 254 scripts de tests. Ces contrôles ne sont pas une exécution de toutes les partitions CI.

Le lancement Codex/Pi et le passage à la revue sur tmux sont simulés avec le vrai propriétaire de lancement et un terminal factice. Aucun agent réel ni pilote n'a été lancé. Cette preuve ne qualifie pas le comportement des interfaces réelles ni l'obtention de leur rapport terminal. La déclaration de rapport complet reste une responsabilité explicite du coordinateur P1 après réception effective du résultat.

La CI hébergée complète a été exécutée sur la branche publiée, avec les lanes macOS et Herdr et le test de structure Ruby `tests/fm-ci-workflow.test.sh`. Les [résultats du workflow CI](https://github.com/abdwhb-png/firstmate/actions/workflows/ci.yml?query=branch%3A2911a3bb6dd1%2Bfork-1) sont la preuve de référence : la qualification exige la réussite de tous les jobs requis sur le commit effectivement publié et installé. Les pilotes avec agents réels restent non exécutés et nécessitent une autorisation séparée.

R1 est indépendant du raccordement MDD et ne modifie pas la capacité de projet. Les tests ne prouvent pas un confinement des terminaux, l'authenticité cryptographique des instructions utilisateur ni une migration automatique de missions vers une autre distribution. Warriors Trading et No-Mistakes sont hors des opérations effectuées pour cette qualification.

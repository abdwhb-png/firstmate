# Fork FirstMate et raccordement MDD

Cette conception correspond au plan autorisé le 14 octobre 2026. La branche candidate est `2911a3bb6dd1+fork-1`, fondée sur le commit officiel complet `2911a3bb6dd1b41061fb4dc87738791bf78008f4`. Le fork natif est [abdwhb-png/firstmate](https://github.com/abdwhb-png/firstmate). Les vérifications courantes et leurs limites sont consignées dans [la qualification](../verification/fork-mdd.md). La publication de la branche et la bascule de l'installation restent des opérations distinctes, soumises à leur autorisation.

## Décisions retenues

| Référence | Décision |
| --- | --- |
| D1 | Une tâche principale et un worktree par mission. FirstMate prépare, coordonne et examine les résultats. L'agent implémente les paquets successifs. |
| D2 | FirstMate peut accepter un paquet qu'il n'a pas implémenté. Une revue dédiée remplace l'implémenteur arrêté par un réviseur en contexte neuf dans la même tâche. L'acceptation finale exige ce réviseur indépendant. |
| D3 | Mode MDD `coordinated`, bundle externe obligatoire et qualifié, version du projet prioritaire, copie figée par mission. Aucune version de secours embarquée. |
| D4 | Contrôles P1 sur les chemins gérés par FirstMate. Aucun confinement des terminaux, aucune reprise de Warriors Trading et aucun lancement automatique de No-Mistakes. |

FirstMate applique les décisions et les préférences chez leurs propriétaires existants, notamment les sources de mémoire externes déclarées. Une autorisation de mission couvre sa progression normale. Le coordinateur ne redemande pas un accord à chaque paquet et sollicite l'utilisateur uniquement pour une décision nouvelle. Les règles de granularité R2 restent dans MDD.

## Propriétaires et mécanisme

| Lot | Propriétaire | Comportement |
| --- | --- | --- |
| I1 / R1 | `fm-control`, `fm-supervision-lib`, `fm-crew-state`, `fm-watch` | Un arrêt positivement constaté publie `stopped_gen` sous le verrou de métadonnées. Seule la génération correspondante bénéficie de cette preuve. Les pipelines attribués, sources indépendantes et notifications conservent leur existence. Les règles de capacité restent inchangées. |
| I2 | `fm-spawn` et `fm-mdd-lib.mjs` | Préparer le worktree et la tâche sans terminal. Figer le bundle complet avant les affectations. Les documents sont rédigés dans ce worktree, sans commit de transport ni copie du travail étranger. |
| I3 | `fm-control`, `fm-spawn`, `fm-send` | Valider l'état courant avec le CLI figé, publier l'affectation avec son brief immuable, puis lancer ou informer l'implémenteur existant. Les verrous de contrôle et de lancement excluent une seconde exécution. |
| I4 | `fm-dod-lib`, `fm-control` et leurs consommateurs | Enregistrer un candidat, examiner un résultat MDD, puis distinguer acceptation finale et livraison. Les preuves d'exécution relient le résultat à l'identité réelle de lancement et au contenu examiné. |
| I5 | Instructions existantes de validation, de livraison et d'orchestration | Exiger un accord applicable pour No-Mistakes, distinct de la publication. Poursuivre les paquets autorisés. Utiliser les événements et attentes déterministes existants. |

La bibliothèque MDD contient la mécanique de raccordement : identité et copie du bundle, appel du CLI, références validées, affectations et liaison aux preuves FirstMate. Elle ne modifie ni l'état ni le journal MDD, ne possède aucun schéma MDD et n'ordonnance pas les paquets. Le coordinateur utilise les procédures du skill figé pour écrire les artefacts. Une incohérence état/journal bloque le prochain lancement et se traite par la procédure de reprise MDD, jamais par une réparation silencieuse FirstMate.

## Bundle externe et stabilité

La distribution initialement ciblée est MDD `v0.4-experimental`, provenant de `71a3d3570d5dd04992f16dfff617bb31090d7732` dans [agent-tools](https://github.com/abdwhb-png/agent-tools). Son empreinte qualifiée est `c6790f60fec0d812c8f1fb2a6555547643a7cc717de352291b6d8c0626d8cdc7`. L'identité porte sur les fichiers de la distribution, pas sur son seul numéro de version. Node 24 ou ultérieur exécute son CLI généré sans installation de paquets.

Le répertoire externe est explicite. Une distribution présente dans les emplacements de skills du projet prend priorité selon le contrat de préparation documenté dans [fm-spawn](../../bin/fm-spawn.sh). Une version inconnue, incomplète, altérée ou ambiguë refuse la préparation et demande une décision. Le fork ne substitue aucun bundle de secours. Le dépôt agent-tools n'est requis ni sur la machine d'exécution ni après la préparation.

La copie figée et son manifeste résident dans les données de la tâche. Les lancements et reprises vérifient cette copie et l'état courant. Modifier ou supprimer la source externe n'affecte pas une mission préparée. Une migration explicite vers une autre distribution nécessite d'abord sa qualification et une procédure adaptée aux missions concernées, elle n'est pas une opération automatique de cette version.

## Affectations, candidats et revues

Le contrat des commandes appartient à [fm-spawn](../../bin/fm-spawn.sh) et [fm-control](../../bin/fm-control.sh), accessibles par leur aide. La préparation crée une tâche `prepared`, sans agent ni obligation artificielle de supervision. Une affectation référence la mission, sa révision, le paquet, le worktree, le bundle et une preuve d'autorité déjà présente dans l'état MDD. Son brief est immuable et publié par référence dans les mêmes métadonnées.

Le premier démarrage passe par le contrôle. Une affectation suivante conserve l'implémenteur vivant et lui transmet le nouveau brief par le canal existant. Le changement de paquet exige que le précédent résultat ait été examiné. Une simple interruption reprend la même affectation. Le remplacement reconstruit le lancement depuis le brief courant et conserve les fichiers du worktree.

Pour une revue dédiée, le contrôle confirme l'arrêt de l'agent précédent. Le lancement crée une nouvelle génération et n'utilise pas les options de reprise de conversation. Le handoff de validation vient de MDD. Le rapport complet est conservé dans les données de tâche et référencé dans le résultat MDD. FirstMate doit recevoir le rapport terminal complet avant de l'enregistrer. Une déclaration de progrès ne suffit pas.

Les reçus FirstMate relient les rapports à l'affectation et à la génération dont le contrôle a constaté le démarrage. L'acceptation refuse un acteur implémenteur, un rapport absent ou changé, un contenu examiné devenu différent et une fausse déclaration de contexte neuf. L'empreinte couvre les fichiers suivis et non ignorés du worktree, y compris les modifications non commitées, ainsi que les preuves référencées. L'état, le journal et les résultats administratifs MDD sont exclus de l'empreinte du contenu pour que l'enregistrement du verdict ne provoque pas à lui seul une nouvelle revue. Leurs références et leur cohérence restent vérifiées par le vrai validateur.

Un rejet conserve le candidat et ses preuves. Le coordinateur suit ensuite MDD pour affecter la correction. L'acceptation finale exige un réviseur neuf ayant examiné toute la mission. La livraison exige ensuite l'accord applicable, des données acceptées inchangées, leur enregistrement Git et les conditions ordinaires du mode de livraison. Le nettoyage conserve son propriétaire et sa décision séparés.

## Autorité et limites de P1

Le coordinateur référence la véritable instruction utilisateur qui autorise une affectation, une revue, No-Mistakes ou la livraison. Une preuve non vide et un JSON valide ne démontrent pas le sens d'une autorisation en langage naturel. Le contrôle assure les correspondances vérifiables et conserve l'attestation explicite du coordinateur. Il ne prétend pas authentifier l'auteur de chaque fichier local ni empêcher un terminal de contourner ses commandes.

Un mode de livraison, une préférence ou un résultat `done` ne vaut jamais accord No-Mistakes. Une exécution autorisée susceptible de modifier le résultat précède son acceptation finale. Ses changements sont examinés. Si le pipeline prévoit une publication, son autorisation doit couvrir cet effet et les conditions d'acceptation applicables doivent être satisfaites avant cet effet. Une validation ne vaut pas permission de publier.

Les préférences restent dans la configuration et les sources de mémoire existantes. FirstMate n'ajoute aucune boucle LLM pour constater l'absence de changement. Les retours utilisent les événements existants. Les attentes externes utilisent leur mécanisme déterministe existant.

## Versions installées et retour arrière

| Référence | Règle |
| --- | --- |
| B1 | Le checkout de développement est distinct de l'installation et préserve ses modifications et données privées. |
| B2 | `origin` désigne le fork et `official` le dépôt officiel. La destination GitHub de publication est explicitement le fork. |
| B3 | La branche `2911a3bb6dd1+fork-1` devient figée lorsqu'elle est publiée et installée. Le SHA officiel complet de cette version figure en tête du document. |
| B4 | Chaque version suivante reçoit un compteur supérieur et sa base officielle exacte. Conserver les anciennes branches, intégrer upstream dans la nouvelle et retirer les personnalisations devenues redondantes. Aucune réécriture forcée des versions livrées. |
| B5 | L'installation utilise directement la branche choisie. `fm-update` conserve son commit et synchronise les secondmates sur ce commit exact au lieu de `main`. |

La CI cible aussi les branches versionnées. La qualification MDD utilise une distribution externe au commit fixé. L'attestation No-Mistakes du dépôt officiel n'est pas obligatoire dans le fork.

Une divergence non redondante d'un secondmate, y compris lors d'un retour arrière, reste signalée par le propriétaire existant et exige une réconciliation explicite. L'updater ne réécrit pas ses commits pour le forcer sur la cible.

Une bascule arrête proprement les exécutions concernées et conserve la référence précédente et les données privées. Le retour arrière réinstalle cette référence sans supprimer les worktrees, les preuves ni les bundles. Cette version n'écrit pas le brief traditionnel attendu par les anciennes versions pour une tâche MDD : leur relance ordinaire doit refuser cette tâche, pas la reprendre en perdant ses contraintes. Ne pas fabriquer un brief de compatibilité pour contourner ce refus.

La première préparation/lancement MDD est limitée au backend tmux. Les mécanismes de lancement Codex et Pi sont couverts par des simulations sans agents réels. Les pilotes avec agents nécessitent leur autorisation séparée et restent nécessaires avant d'annoncer ces combinaisons comme qualifiées en usage réel. Les autres backends ne sont pas annoncés comme qualifiés.

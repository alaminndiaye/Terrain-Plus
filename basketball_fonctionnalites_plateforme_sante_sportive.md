# Rapport — Fonctionnalités spécifiques au basketball

**Projet :** plateforme de mise en relation entre sportifs et médecins  
**Marché initial :** Sénégal  
**Date :** 27 novembre 2026  
**Auteur :** Manus AI

## 1. Orientation produit

La plateforme doit reconnaître les réalités du basketball — sauts et réceptions, changements de direction, pivots, contacts, ballon reçu sur les doigts, entraînements répétés — pour aider le sportif à décrire son problème et à trouver un médecin pertinent. Elle ne doit pas tenter de diagnostiquer une blessure ni décider si le sportif peut reprendre le jeu. Ces décisions relèvent d’un professionnel de santé.

Une revue systématique consacrée aux blessures en basketball situe les blessures des membres inférieurs, notamment à la cheville et au genou, parmi les localisations fréquentes; les entorses et atteintes ligamentaires sont souvent rapportées. La FIBA mentionne aussi les douleurs chroniques du dos, les blessures de surutilisation des tendons et des os, ainsi que les commotions comme sujets de vigilance. Les fréquences varient selon les études et les populations, et ne doivent pas être présentées comme des statistiques propres aux joueurs sénégalais.[1] [2]

## 2. Parcours basketball du sportif

### 2.1 Profil sportif utile à la prise en charge

Le profil doit rester court et permettre d’indiquer :

- le niveau de pratique : loisir, scolaire/universitaire, club ou compétition ;
- le poste, facultatif : meneur, arrière, ailier, ailier fort ou pivot ;
- la fréquence des entraînements et des matchs, facultative ;
- le club ou l’équipe, facultatif et privé par défaut ;
- le côté dominant, facultatif ;
- les blessures antérieures, uniquement si le sportif souhaite les déclarer.

Ces renseignements servent à contextualiser la demande et à améliorer les filtres. Ils ne doivent pas être utilisés seuls pour produire une estimation de risque ou une décision médicale. Le profil peut évoluer au fil du temps sans obliger le sportif à refaire son dossier.

### 2.2 Formulaire de blessure adapté au jeu

Au lieu de demander au sportif de nommer lui-même une pathologie, le formulaire décrit des faits observables avec des mots simples. Il pourrait suivre les étapes suivantes :

1. **Quelle partie du corps vous gêne ?** Cheville/pied, genou, cuisse/jambe, hanche, dos, épaule/bras, coude, poignet/main/doigts, tête ou autre. Une silhouette corporelle cliquable peut compléter la liste, sans la remplacer.
2. **Quand le problème est-il apparu ?** Pendant un match, un entraînement, un exercice individuel ou en dehors du basketball; soudainement ou progressivement.
3. **Que faisiez-vous au moment où il a commencé ?** Réception après un saut, pivot ou changement de direction, accélération, contact avec un autre joueur, ballon reçu sur la main ou les doigts, chute, répétition d’un geste, ou autre.
4. **Qu’observez-vous ?** Douleur, gonflement, gêne pour bouger, sensation inhabituelle ou autre réponse à définir avec des médecins. Le sportif peut préciser le côté et le moment d’apparition.
5. **Est-ce déjà arrivé ?** Le sportif peut signaler un épisode antérieur, un examen déjà réalisé ou un suivi en cours.
6. **Souhaitez-vous une consultation en ligne ou un rendez-vous physique ?** Les médecins disponibles sont ensuite filtrés selon leur statut de vérification, leur spécialité, leur lieu et leurs créneaux.

Le formulaire ne préremplit jamais une conclusion du type « entorse » ou « rupture ligamentaire » à partir des réponses. Les fichiers, photos ou documents médicaux sont facultatifs, expliqués avant envoi et visibles uniquement par les personnes autorisées à traiter le dossier.

### 2.3 Parcours de vigilance pour les traumatismes à la tête

Le basketball peut impliquer une chute ou un choc à la tête. Si le sportif rapporte un choc avec des symptômes pouvant évoquer une commotion, l’interface doit afficher une consigne de sécurité validée par des médecins : arrêter le jeu et demander une évaluation médicale. En présence de signes d’alerte définis par le protocole clinique local, elle doit orienter vers une aide urgente plutôt que vers une messagerie ordinaire. La plateforme ne doit ni déterminer la gravité ni donner un feu vert de reprise.

Le CDC recommande de retirer immédiatement du sport une personne chez qui une commotion est suspectée, de rechercher les signes d’alerte et de ne pas reprendre le sport le jour même; la reprise est une décision médicale.[3] Le contenu exact de l’écran d’alerte et les contacts d’urgence à afficher au Sénégal doivent être validés localement avant lancement.

### 2.4 Résultats de recherche et profils des médecins

Les résultats peuvent proposer des filtres basketball pertinents : spécialité, ville, consultation en ligne ou physique, disponibilité et langue. Le poste ou le niveau du joueur ne doivent pas être des critères obligatoires.

Chaque carte présente clairement le nom, la spécialité, la ville ou structure d’exercice, le badge **Médecin vérifié**, les modes de consultation, la disponibilité et le tarif. Les avis publics ne sont proposés qu’après une consultation effectivement terminée. Les coordonnées privées et l’accès à la discussion restent masqués avant la confirmation du paiement, conformément au parcours décidé pour le projet.

Le système peut faire correspondre les motifs déclarés aux spécialités indiquées par les médecins vérifiés. Il faut afficher cette correspondance comme une aide à la recherche, jamais comme une promesse de résultat ou une recommandation clinique automatisée.

### 2.5 Paiement et rendez-vous

Le médecin fixe son tarif de consultation. L’interface de paiement doit afficher le montant avant confirmation et rendre lisible la commission de **10 % destinée à la plateforme**. Pour un rendez-vous physique, les **500 FCFA de frais de réservation** sont ajoutés et présentés séparément.

Le calcul opérationnel de la commission reste à confirmer avant développement : soit les 10 % sont retenus sur le tarif fixé par le médecin, soit ils sont ajoutés au montant payé par le patient. Le prix total, le montant net du médecin et la part de la plateforme doivent être cohérents entre profil, récapitulatif, reçu et tableau de bord. Aucun frais ne doit être découvert après le paiement.

Après paiement confirmé, le patient accède à la messagerie ou reçoit les informations utiles à son rendez-vous physique. Les coordonnées ne sont communiquées qu’au niveau nécessaire au mode de consultation choisi. Le patient reçoit une confirmation avec date, heure, lieu le cas échéant, total payé et règles d’annulation.

## 3. Fonctions du dossier médical sportif

Chaque demande crée un dossier indépendant, daté et associé à un épisode précis. Il comprend le motif initial, les réponses du formulaire, les documents envoyés, les échanges avec le médecin, les rendez-vous et les décisions d’orientation. Le sportif peut voir le statut de son dossier sans être obligé de comprendre des termes médicaux complexes.

Le médecin peut demander un complément, résumer son évaluation, proposer un suivi ou suggérer une orientation vers un autre médecin vérifié. Le partage du dossier exige l’accord du sportif; seules les informations nécessaires au motif d’orientation sont transmises. Le sportif doit voir à qui les informations seront envoyées et pouvoir refuser.

La reprise du basketball est un parcours de suivi médical, pas un bouton automatique « prêt à jouer ». Le médecin peut communiquer des consignes ou étapes de suivi et documenter sa décision. Pour les commotions, les recommandations du CDC prévoient une progression graduelle sous la supervision d’un professionnel, avec son approbation avant la reprise.[4] Pour les autres blessures, la plateforme ne doit pas imposer un protocole unique : les critères dépendent de l’évaluation médicale.

## 4. Prévention et information basketball

Un espace **Prévention basketball** peut proposer des contenus courts, relus et signés par un professionnel : préparation avant l’effort, réceptions et changements de direction, attention à la cheville et au genou, récupération, surcharges et prévention des blessures répétitives. Il est préférable de publier des conseils généraux avec leurs limites plutôt que des exercices individualisés présentés comme une prescription.

Une revue des échauffements neuromusculaires en basketball conclut que les routines multicomposantes comprenant notamment des exercices dynamiques, de force et de saut sont prometteuses pour réduire certaines blessures des membres inférieurs. La qualité des preuves est modérée pour les blessures des membres inférieurs prises globalement, mais plus faible pour d’autres résultats; la revue ne permet pas d’isoler une formule universelle.[5] En conséquence, le MVP peut héberger des fiches éducatives validées et orienter vers le médecin, mais ne devrait pas présenter une routine comme garantie de prévention.

Les fiches pourraient être organisées par moment : **avant l’entraînement**, **pendant la saison**, **après une gêne** et **après une consultation**. Chaque fiche affiche son auteur ou relecteur, sa date de mise à jour et un rappel de consulter en cas de symptômes persistants ou préoccupants.

## 5. Fonctions pour les médecins et l’administration

### Espace médecin

Le tableau de bord du médecin met en avant les nouveaux dossiers, les conversations en attente, les rendez-vous et les demandes d’orientation. Les éléments basketball du dossier apparaissent sous forme de résumé : partie du corps, moment de survenue, geste rapporté, récidive et niveau de pratique. Le médecin peut modifier ses spécialités déclarées, définir ses créneaux physiques et afficher sa structure d’exercice après vérification.

La vérification préalable du médecin reste un prérequis à sa présence dans les résultats et à sa capacité à accepter des patients. Le délai annoncé au projet est de **72 heures**; le statut et les éventuelles demandes de pièces complémentaires doivent être visibles.

### Espace administration

L’administration gère la validation des médecins, les signalements, les avis, les litiges liés aux rendez-vous et les paiements. Les actions sensibles doivent être journalisées. Les avis peuvent être masqués en cas de signalement, mais leur modération ne doit pas révéler publiquement de données de santé.

À terme, des outils destinés aux clubs peuvent être envisagés pour gérer des rendez-vous ou partager une information de disponibilité. Ils ne font pas partie du MVP. Toute transmission à un entraîneur, à un club ou à un parent exige un parcours de consentement distinct; l’accès aux détails médicaux n’est pas accordé par défaut.

## 6. Confidentialité, mineurs et contexte sénégalais

Les réponses au formulaire, les dossiers et les échanges peuvent révéler des données de santé. Le texte sénégalais de la loi n° 2008-12 traite spécifiquement des données de santé : il encadre leur traitement, prévoit des conditions de licéité et mentionne la surveillance d’un professionnel de santé soumis au secret professionnel pour certains traitements de soins. Il traite aussi des transferts de données vers des pays tiers.[6] Avant la mise en production, l’équipe doit faire confirmer par un conseil compétent les formalités applicables au service, à l’hébergement, aux sous-traitants et aux échanges transfrontaliers. La CDP du Sénégal publie une page de formalités et indique des demandes d’autorisation pour certains traitements sensibles, notamment ceux portant sur la santé.[7]

Les exigences produit correspondantes sont : recueillir uniquement les informations nécessaires, expliquer leur usage, séparer le consentement médical du consentement marketing, limiter les accès par rôle, protéger les pièces jointes et enregistrer les accès administratifs. Les données médicales ne doivent pas apparaître dans les avis publics, les notifications sur écran verrouillé ou les outils analytiques non médicaux. Le mode hors ligne de la PWA ne doit pas conserver les conversations ou documents médicaux sur un appareil partagé.

Si les mineurs sont autorisés, il faut prévoir un parcours spécifique conçu avec des professionnels et une validation juridique : représentant légal, information adaptée à l’âge et règles d’accès au dossier. Le produit ne doit pas traiter cette situation comme une simple case à cocher.

Pour le lancement sénégalais, une interface en français simple est un point de départ. L’ajout du wolof ou d’autres langues peut être étudié avec traduction et validation médicale professionnelles. La PWA devrait fonctionner sur des connexions mobiles variables : écrans légers, formulaires progressifs, sauvegarde des étapes non médicales et messages d’erreur compréhensibles. Les contenus sensibles restent protégés et ne sont pas disponibles hors ligne par défaut.

## 7. Priorités de livraison

### MVP — indispensable

- Profil sportif basketball facultatif mais structuré.
- Formulaire guidé de blessure avec partie du corps, contexte de jeu et début des symptômes.
- Parcours de vigilance pour les traumatismes à la tête, validé localement.
- Répertoire de médecins vérifiés, filtres et profils avec tarifs et disponibilités.
- Paiement préalable, accès à la messagerie après paiement et affichage explicite des coûts.
- Rendez-vous physique avec créneaux, lieu, frais de réservation de 500 FCFA et confirmation.
- Dossier, suivi, orientation soumise au consentement et espace de vérification administrateur.
- Protection des données par rôle, règles d’accès et procédure de signalement.

### Après le MVP

- Bibliothèque de prévention basketball validée par des médecins.
- Parcours de suivi de reprise sportive contrôlé par le médecin.
- Avis publics vérifiés et modération.
- Traductions locales validées et amélioration selon les retours d’usage.
- Indicateurs anonymisés de demande et de catégories de blessures, uniquement après validation des règles de confidentialité.

## 8. Indicateurs d’expérience à suivre

Les indicateurs doivent mesurer la facilité d’usage sans inciter à collecter davantage de données médicales que nécessaire : taux d’abandon du formulaire, délai entre recherche et demande, paiements réussis, rendez-vous honorés, temps de réponse des médecins, délai de vérification des comptes, demandes d’orientation acceptées et incidents de confidentialité signalés.

Les données de pathologie ne doivent pas être exposées dans des rapports nominatifs aux clubs ou utilisées pour établir publiquement un classement des sportifs. Les statistiques d’usage sur les blessures ne peuvent être envisagées qu’avec des garanties de confidentialité et après validation des obligations applicables.

## 9. Décisions à figer avant maquettes détaillées

1. La commission de 10 % est-elle déduite du tarif médecin ou ajoutée au paiement du patient ?
2. Quels moyens de paiement seront proposés au Sénégal et comment gérer les échecs, remboursements et annulations ?
3. Les mineurs peuvent-ils créer un compte et, si oui, selon quel parcours de représentation ?
4. Quels contacts et signes d’alerte locaux doivent être affichés pour les urgences ?
5. Quelles spécialités et structures de soins seront affichées au lancement, et comment valider leur lien avec le basketball ?
6. Qui relira et maintiendra les contenus de prévention et de sécurité médicale ?

## Références

[1]: https://pmc.ncbi.nlm.nih.gov/articles/PMC11278090/ "Sports Injuries in Basketball Players: A Systematic Review"
[2]: https://about.fiba.basketball/en/services/medical/information-for-medical-staff "FIBA Medical Commission — Information for Medical Staff"
[3]: https://www.cdc.gov/heads-up/response/index.html "CDC HEADS UP — Responding to a Sports-related Concussion"
[4]: https://www.cdc.gov/heads-up/guidelines/returning-to-sports.html "CDC HEADS UP — Returning to Sports"
[5]: https://pmc.ncbi.nlm.nih.gov/articles/PMC8446130/ "The Effectiveness of Neuromuscular Warmups for Lower Extremity Injury Prevention in Basketball: A Systematic Review"
[6]: https://www.afapdp.org/wp-content/uploads/2018/05/Senegal-texte-de-loi-2008.pdf "Sénégal — Loi n° 2008-12 sur la protection des données à caractère personnel"
[7]: https://www.cdp.sn/conformite/formalites "Commission de Protection des Données Personnelles du Sénégal — Formalités déclaratives"

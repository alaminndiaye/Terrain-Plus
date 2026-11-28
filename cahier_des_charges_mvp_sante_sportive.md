# Cahier des charges fonctionnel — MVP

**Projet :** plateforme de santé sportive, focus basketball  
**Marché initial :** Sénégal  
**Version :** 1.0 — 27 novembre 2026

## 1. Objet et limites

Ce document décrit les fonctionnalités attendues pour le MVP d’une PWA mobile-first qui met en relation des sportifs et des médecins vérifiés. Il sert de référence pour les maquettes et le vibe coding.

Le MVP facilite la recherche, les paiements, les consultations en ligne par messagerie et les rendez-vous physiques. Il ne fournit ni diagnostic automatisé ni décision d’aptitude sportive. La sécurité médicale et les obligations sénégalaises relatives aux données de santé doivent être validées par des professionnels compétents avant l’ouverture au public.

## 2. Rôles et droits

### Visiteur non connecté
- Voir la présentation du service et les explications sur son fonctionnement.
- Voir les médecins vérifiés et leurs profils publics, selon la politique de visibilité retenue.
- Ne pas démarrer une discussion, réserver ou consulter des données de dossier.

### Sportif connecté
- Créer et gérer son profil.
- Remplir et consulter ses demandes et dossiers.
- Rechercher les médecins vérifiés.
- Initier un paiement ou une réservation.
- Accéder à la messagerie après confirmation du paiement.
- Autoriser ou refuser l’orientation et le partage d’informations.
- Déposer un avis après une consultation terminée et signaler un contenu.

### Médecin en attente de vérification
- Compléter son inscription et envoyer les justificatifs.
- Consulter l’état de vérification et répondre à une demande de complément.
- Ne pas apparaître dans les résultats, recevoir de patient ou consulter des dossiers.

### Médecin vérifié
- Gérer son profil public, ses spécialités, son tarif et ses disponibilités.
- Recevoir et traiter les demandes auxquelles il est affecté.
- Échanger avec le patient dans le dossier concerné.
- Proposer une orientation vers un autre médecin vérifié.
- Gérer ses rendez-vous et consulter ses paiements selon son rôle.

### Administrateur
- Examiner les demandes de vérification et les justificatifs nécessaires.
- Valider, refuser ou demander un complément avec motif.
- Modérer les avis et traiter les signalements.
- Gérer les comptes et consulter les éléments nécessaires au traitement des incidents.
- Consulter un journal des actions administratives.
- Ne pas accéder par défaut à toutes les conversations médicales; tout accès exceptionnel doit être justifié, limité et journalisé.

## 3. Navigation principale

### Navigation sportif
- Accueil
- Trouver un médecin
- Mes dossiers / messages
- Rendez-vous
- Profil

### Navigation médecin
- Tableau de bord
- Patients / dossiers
- Rendez-vous
- Profil et disponibilités
- Revenus / paiements

### Navigation administration
- Vérifications médecins
- Comptes
- Avis et signalements
- Paiements et rendez-vous
- Journal d’activité

L’affichage doit être responsive. Sur petit écran, les actions principales restent accessibles sans menu complexe.

## 4. Fonctionnalités et règles métier

### 4.1 Accueil et inscription

**FON-001 — Choix du profil**  
L’utilisateur choisit « Sportif » ou « Médecin » au démarrage de l’inscription. Le rôle administrateur ne peut pas être créé depuis l’inscription publique; il est attribué par un administrateur autorisé.

**FON-002 — Création de compte**  
Le sportif et le médecin fournissent les coordonnées et identifiants requis, acceptent les conditions et vérifient un moyen de contact. Les champs obligatoires doivent être définis avant le développement et limités au nécessaire.

**FON-003 — Connexion et récupération d’accès**  
Un utilisateur peut se connecter, se déconnecter et récupérer l’accès à son compte par un processus vérifié. Les erreurs d’authentification restent génériques et ne révèlent pas si un compte existe.

**Critères d’acceptation :** les comptes ont un rôle unique attribué; un compte médecin nouvellement créé reste en attente; aucun visiteur ne peut accéder à une page de dossier.

### 4.2 Profil sportif et demande basketball

**FON-010 — Profil sportif**  
Le profil permet d’ajouter les renseignements essentiels. Le basketball est proposé comme sport prioritaire. Niveau, poste et club sont facultatifs. Le profil n’est pas visible publiquement.

**FON-011 — Formulaire de demande**  
Le formulaire guide le sportif à travers : zone concernée, côté du corps si utile, moment d’apparition, contexte de jeu (match, entraînement, réception après un saut, pivot/changement de direction, contact, impact du ballon, geste répétitif, autre), description libre et demande précédente ou récurrente.

Le sportif peut choisir « Je ne sais pas » pour éviter de devoir attribuer un nom médical à son problème. Le formulaire ne génère pas de diagnostic. Les pièces jointes sont facultatives et font l’objet d’une explication avant téléversement.

**FON-012 — Parcours de sécurité**  
Les réponses concernant un choc à la tête ou un symptôme d’alerte peuvent déclencher un écran de sécurité rédigé et approuvé par des professionnels de santé locaux. Cet écran oriente vers une prise en charge urgente si le protocole approuvé l’exige. Il ne diagnostique pas et ne remplace pas les services d’urgence.

**Critères d’acceptation :** le formulaire fonctionne sur mobile; il peut être interrompu et repris avant soumission; les réponses sont visibles dans le dossier associé; aucun résultat ne nomme une pathologie comme un diagnostic.

### 4.3 Recherche et profil des médecins

**FON-020 — Annuaire**  
Seuls les médecins au statut « Vérifié » apparaissent dans l’annuaire. Les filtres proposés sont spécialité, ville, consultation en ligne ou physique et disponibilité. La note publique peut être un filtre facultatif après qu’un nombre suffisant d’avis existe.

**FON-021 — Carte et profil médecin**  
La carte affiche nom, spécialité, ville, modes de consultation, tarif, disponibilité et badge « Médecin vérifié ». Le profil peut inclure langues, présentation professionnelle et structure d’exercice vérifiée.

Les coordonnées directes du médecin sont masquées avant paiement confirmé. Le profil peut afficher les informations publiques nécessaires au choix du professionnel, sans exposer de coordonnées privées.

**FON-022 — Recherche et demande**  
Le sportif peut sélectionner un médecin puis choisir consultation en ligne ou rendez-vous physique. Les résultats ne garantissent pas que le médecin traite la pathologie; l’interface présente la recherche comme une mise en relation.

**Critères d’acceptation :** un médecin en attente, refusé ou suspendu ne peut être trouvé ni réservé; filtres et résultats restent utilisables sur petit écran.

### 4.4 Profil et vérification du médecin

**FON-030 — Dépôt du dossier professionnel**  
Le médecin renseigne sa spécialité, ville et hôpital/structure d’exercice, puis téléverse sa carte professionnelle et les justificatifs demandés. Les fichiers sont accessibles uniquement aux rôles autorisés à vérifier le dossier.

**FON-031 — Statuts de vérification**  
Statuts possibles : « À compléter », « En attente », « Justificatif demandé », « Vérifié », « Refusé » et « Suspendu ». Toute demande de complément ou décision de refus inclut un motif communiqué au médecin.

**FON-032 — Délai cible**  
Le tableau de bord administratif montre la date de réception et l’échéance cible de 72 heures. Cette échéance est une cible de traitement, non une validation automatique.

**Critères d’acceptation :** la validation est une action manuelle d’un administrateur habilité; elle est datée, attribuée et journalisée; aucun justificatif n’est accessible à un autre médecin ou à un sportif.

### 4.5 Tarifs, paiements et reçus

**FON-040 — Tarif médecin**  
Le médecin vérifié peut définir le tarif de consultation. Le montant et la devise FCFA sont affichés avant l’achat. Une validation de format empêche un montant nul ou invalide.

**FON-041 — Commission plateforme**  
Une commission de 10 % est due à la plateforme pour chaque consultation payée. Le mécanisme exact — commission prélevée sur le tarif médecin ou ajoutée au paiement du patient — doit être choisi avant l’intégration du paiement réel. Tant que cette règle n’est pas confirmée, le prototype affiche une ventilation simulée et configurable, sans mouvement financier réel.

**FON-042 — Frais de réservation physique**  
Une réservation physique ajoute 500 FCFA de frais de réservation à la plateforme, distincts du tarif de consultation. Le récapitulatif montre au minimum le tarif de consultation, les frais de réservation, la commission et le total dû selon le mode de calcul confirmé.

**FON-043 — Paiement préalable et états**  
États : « En attente », « Réussi », « Échoué », « Annulé », « Remboursement demandé », « Remboursé ». Une confirmation de paiement doit provenir du prestataire de paiement, pas uniquement du navigateur.

**FON-044 — Accès après paiement**  
Pour une consultation en ligne, le paiement confirmé ouvre la conversation et les coordonnées nécessaires. Pour une visite physique, le paiement confirmé réserve le créneau et affiche les informations de rendez-vous.

**FON-045 — Reçu**  
Après paiement, un reçu consultable affiche la date, le dossier ou rendez-vous associé, le montant total, les frais et la ventilation applicable.

**Critères d’acceptation :** les paiements sont idempotents (un même événement de paiement ne crée pas plusieurs achats); un paiement échoué n’ouvre pas la messagerie et ne confirme pas le créneau; le mode test est utilisé avant tout lancement réel.

### 4.6 Consultation en ligne et messagerie

**FON-050 — Création du dossier**  
Une demande payée crée ou active un dossier privé lié au patient et au médecin sélectionné. Le dossier affiche le motif initial et son statut.

**FON-051 — Messages**  
Le patient et le médecin associés peuvent envoyer des messages texte. Les pièces jointes, si activées, sont limitées en taille et en types, protégées et accessibles uniquement aux personnes autorisées. Une conversation ne peut pas être découverte par d’autres utilisateurs.

**FON-052 — Statuts dossier**  
Statuts proposés : « Paiement en attente », « Demande envoyée », « En discussion », « Orientation proposée », « Rendez-vous confirmé », « Terminé » et « Annulé ».

**FON-053 — Orientation**  
Le médecin sélectionne un médecin vérifié, saisit le motif d’orientation et choisit les éléments proposés au partage. Le patient voit la destination et le contenu à transmettre puis accepte ou refuse. Aucun transfert n’a lieu sans accord explicite.

**Critères d’acceptation :** un autre patient ou médecin ne peut pas lire le dossier; le consentement et le transfert sont horodatés; le refus conserve la conversation et ne partage rien.

### 4.7 Rendez-vous physique

**FON-060 — Disponibilités**  
Le médecin configure ses créneaux et le lieu de consultation. Un créneau réservé n’est plus proposé à un autre patient, selon la capacité définie.

**FON-061 — Réservation**  
Le patient choisit date, heure et lieu, consulte le tarif et les frais de 500 FCFA, puis paie. Le créneau n’est confirmé qu’après confirmation du paiement.

**FON-062 — Confirmation et annulation**  
Le patient et le médecin voient les informations du rendez-vous et son statut. La politique d’annulation, de remboursement et de retard doit être rédigée avant production. Le prototype peut offrir des statuts et simuler ces actions, sans décider arbitrairement des remboursements.

**Critères d’acceptation :** un créneau confirmé ne peut pas être vendu une seconde fois; une réservation expirée libère le créneau; le reçu distingue les 500 FCFA des autres montants.

### 4.8 Avis publics et signalements

**FON-070 — Éligibilité**  
Le patient peut laisser un avis uniquement lorsqu’une consultation ou un rendez-vous associé est marqué « Terminé ».

**FON-071 — Contenu**  
Avis constitué d’une note et d’un commentaire. L’interface déconseille la publication d’informations médicales personnelles et permet de signaler un avis. Les règles de modération indiquent les contenus interdits et le processus de contestation.

**FON-072 — Modération**  
L’administration peut masquer temporairement un avis signalé, examiner le motif et prendre une décision journalisée. Elle ne modifie pas silencieusement les propos d’un utilisateur.

**Critères d’acceptation :** un avis est associé à une consultation terminée; un utilisateur ne peut pas multiplier artificiellement les avis sur le même acte; aucun avis n’expose le dossier médical du patient.

### 4.9 Administration

**FON-080 — File de vérification**  
L’administration peut trier les dossiers médecins par date, statut et échéance, afficher les pièces nécessaires, puis approuver, refuser ou demander un complément.

**FON-081 — Comptes et signalements**  
L’administration peut suspendre un compte ou traiter un signalement avec un motif. Les actions sensibles sont limitées aux administrateurs autorisés.

**FON-082 — Journal d’activité**  
Le journal conserve l’auteur, l’action, l’objet concerné, la date et le motif lorsque nécessaire. Il ne doit pas dupliquer le contenu médical des conversations.

**Critères d’acceptation :** les changements de statut sont traçables; les administrateurs ne peuvent pas se connecter comme patient ou médecin sans un mécanisme d’assistance dûment journalisé.

## 5. Exigences non fonctionnelles

### Utilisabilité et performance
- Interface responsive et adaptée au tactile.
- Formulaires courts, indicateur de progression et messages d’erreur compréhensibles.
- Pages essentielles optimisées pour les connexions mobiles variables.
- Les données saisies dans un formulaire peuvent être reprises sans répéter toutes les étapes, sous réserve de protections adaptées.

### Sécurité et confidentialité
- Contrôle d’accès par rôle et par dossier.
- Protection des sessions, des mots de passe, des fichiers et des communications.
- Limitation de la collecte aux données utiles au service.
- Aucune donnée médicale dans les notifications poussées ou les URL.
- Pas de cache hors ligne des messages ou documents médicaux par défaut.
- Journalisation des consultations administratives et export limité.
- Procédures de correction, suppression, incident et demande d’accès à définir avec conseil compétent.
- Les obligations applicables au traitement des données de santé et à leur hébergement/transfert au Sénégal doivent être examinées avant la production.

### Accessibilité et langue
- Français simple pour la première version.
- Contraste lisible, tailles tactiles suffisantes et libellés textuels accompagnant les icônes.
- La traduction vers le wolof ou d’autres langues est une évolution, à faire relire par des locuteurs et des professionnels de santé.

### PWA
- Installation possible depuis un navigateur compatible.
- Mise à jour claire lorsque la nouvelle version de l’application est disponible.
- Fonctionnement hors ligne limité aux pages publiques non sensibles; les échanges médicaux et données privées requièrent une connexion.

## 6. Maquettes minimales à produire

1. Accueil et choix du rôle.
2. Inscription, connexion et récupération d’accès.
3. Profil sportif et formulaire basketball.
4. Liste de médecins, filtres et profil public.
5. Choix du mode de consultation et récapitulatif de paiement.
6. Confirmation du paiement et reçu.
7. Messagerie et détail du dossier.
8. Choix de créneau physique et confirmation du rendez-vous.
9. Inscription médecin et dépôt de justificatifs.
10. Tableau de bord médecin et disponibilités.
11. Tableau de bord administration et vérification d’un médecin.
12. Avis, signalement et modération.

## 7. Données principales à prévoir

- **Utilisateur :** identifiant, rôle, nom, coordonnées, état du compte et horodatages.
- **Profil sportif :** sport, niveau facultatif, poste facultatif, ville et préférences.
- **Profil médecin :** spécialités, ville, structure d’exercice, tarif, modes de consultation, statut de vérification et disponibilités.
- **Justificatif médecin :** type, fichier protégé, date d’envoi, statut, motif de décision et agent ayant traité le dossier.
- **Dossier :** sportif, médecin, motif, réponses au formulaire, statut, dates et consentements.
- **Message :** dossier, auteur, contenu, éventuel fichier et horodatage.
- **Paiement :** référence, montant, frais, commission, état, prestataire et dossier/rendez-vous associé.
- **Rendez-vous :** médecin, patient, créneau, lieu, statut et politique applicable.
- **Avis :** auteur, consultation liée, note, commentaire, statut de modération et signalements.
- **Journal :** acteur, action, objet, date et motif.

Les données de santé doivent être séparées logiquement des données publiques de profil. La conception technique doit empêcher la lecture par défaut des pièces médicales par les administrateurs qui n’en ont pas besoin.

## 8. Scénarios de test essentiels

1. Un sportif crée un compte et soumet une blessure de cheville survenue à la réception d’un saut.
2. Le sportif filtre les médecins pour une consultation en ligne et voit les tarifs avant achat.
3. Un médecin en attente de validation ne figure pas dans les résultats.
4. Un administrateur demande un justificatif supplémentaire; le médecin voit le statut et le motif.
5. Après validation, le profil du médecin est visible et son tarif peut être modifié.
6. Un paiement de test réussi ouvre la messagerie; un paiement échoué ne l’ouvre pas.
7. Un rendez-vous physique ajoute 500 FCFA, bloque le créneau après paiement confirmé et génère un reçu détaillé.
8. Une proposition d’orientation ne transmet aucune donnée tant que le patient n’a pas accepté.
9. Un patient ne peut laisser un avis que pour une consultation terminée.
10. Un administrateur traite un signalement et l’action apparaît dans le journal.
11. Un autre utilisateur ne peut accéder à aucun dossier en modifiant une URL ou un identifiant.
12. Une notification ne montre pas le motif médical ou le texte des messages sur l’écran verrouillé.

## 9. Décisions bloquantes avant l’intégration réelle

- **Commission de 10 % :** déduite du prix médecin ou ajoutée au paiement du patient.
- **Paiement :** prestataire(s) accepté(s), devises, confirmations serveur, délais de transfert au médecin, remboursements et rapprochement.
- **Frais de 500 FCFA :** confirmation de leur caractère non remboursable ou de la règle applicable en cas d’annulation; ne pas inventer cette politique.
- **Mineurs :** autorisés ou non, représentation et accès au dossier.
- **Urgences :** formulation, critères d’escalade et contacts sénégalais approuvés par un professionnel local.
- **Vérification médicale :** processus de contrôle de la carte professionnelle et de la structure d’exercice, avec solution de repli si un registre n’est pas consultable.
- **Données :** formalités applicables, hébergement, sous-traitants, durée de conservation, droits des utilisateurs et transferts à l’étranger.
- **Modération :** politique relative aux avis, signalements, faux profils et conflits d’intérêt.

## 10. Plan de livraison recommandé

**Étape 1 — Prototype navigable :** maquettes et données fictives des trois espaces; simulation des paiements; aucun document médical réel.

**Étape 2 — MVP test fermé :** comptes, contrôle d’accès, vérification médecin, annuaire, demandes basketball, messagerie et rendez-vous avec paiements de test; test avec un petit groupe de sportifs et médecins.

**Étape 3 — Préparation au lancement :** intégration du prestataire de paiement choisi, règles financières finalisées, validation des contenus d’urgence, examen des obligations de protection des données et test de sécurité.

**Étape 4 — Ouverture progressive :** suivi des incidents, des délais de vérification et des retours d’usage; correction avant extension à d’autres sports ou fonctions.

## 11. Règle de réussite du MVP

Le MVP est prêt pour un test fonctionnel lorsque les trois rôles peuvent accomplir leur parcours de bout en bout avec des données fictives : le sportif trouve un médecin vérifié, comprend les frais, simule le paiement et accède à son dossier; le médecin suit sa vérification, gère son profil et ses disponibilités; l’administrateur vérifie un médecin et traite un signalement. Le lancement avec données et paiements réels exige en plus la résolution des décisions bloquantes de la section 9.
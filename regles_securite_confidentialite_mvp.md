# Règles de sécurité et de confidentialité — MVP

**Projet :** plateforme de santé sportive, lancement au Sénégal, priorité basketball  
**Version :** 1.0 — 27 novembre 2026

## 1. Objectif et limites

Ce document définit les protections produit minimales pour concevoir et tester la plateforme. Il traite des données de compte, des justificatifs professionnels, des dossiers de santé, de la messagerie, des rendez-vous, paiements et avis.

Ce document n’est pas un avis juridique ni une certification de sécurité. Avant l’ouverture avec de vrais patients, des médecins, un responsable sécurité et un conseil compétent au Sénégal doivent valider les mesures, les formalités applicables et les contrats avec les prestataires.

## 2. Principes obligatoires

1. **Collecter le minimum nécessaire.** Ne pas demander une donnée simplement parce qu’elle pourrait être utile un jour.
2. **Expliquer l’usage.** Présenter au moment de la collecte pourquoi la donnée est demandée, qui pourra la voir et si elle est obligatoire.
3. **Séparer public et médical.** Les profils publics et avis ne contiennent jamais de dossier ou détail médical.
4. **Accès par rôle et par dossier.** Être connecté ne suffit pas; l’utilisateur doit être autorisé à consulter ce dossier précis.
5. **Consentement explicite et traçable.** Une orientation ou transmission de données médicales est bloquée jusqu’à l’accord du patient.
6. **Aucune décision clinique automatisée.** Le produit ne diagnostique pas et n’autorise pas le retour au sport.
7. **Protéger par défaut.** Notifications, exports, stockage local et outils analytiques ne révèlent pas les données de santé.
8. **Utiliser des données fictives en développement et démonstration.** Aucun dossier médical réel dans les environnements de prototype ou les outils de vibe coding non approuvés.

## 3. Catégories de données et niveau de protection

### Données de compte
Nom, coordonnées, identifiants techniques, rôle et préférences. Elles sont privées et ne sont visibles que selon le besoin du service.

### Profil public du médecin
Nom professionnel, spécialités, structure d’exercice approuvée, ville, langue, tarif, disponibilités et avis publiables. Les coordonnées privées sont distinctes et masquées avant paiement selon le parcours produit.

### Justificatifs professionnels
Carte professionnelle, éléments relatifs à la structure d’exercice, échanges de vérification et décisions administratives. Accès limité aux administrateurs habilités chargés de la vérification. Le document ne doit pas être rendu public ni transmis à des patients.

### Données de santé
Réponses sur les symptômes, blessures ou pathologies, historique, pièces jointes et échanges médecin-patient. Accès restreint au patient, au médecin associé et au personnel habilité lorsqu’un besoin opérationnel documenté l’exige.

### Données de rendez-vous et de paiement
Créneaux, lieu, statut de réservation, montants, frais, référence de transaction et état de paiement. Les informations de carte ou secret de paiement restent chez le prestataire de paiement; la plateforme conserve seulement les références et confirmations nécessaires.

### Avis publics
Note et commentaire après consultation terminée. Le formulaire avertit de ne pas publier de diagnostic, symptôme détaillé, document ou identité d’un tiers. Les avis signalés suivent une procédure de modération.

## 4. Accès et responsabilités

### Sportif
Accède à son profil, à ses dossiers, aux conversations dont il est participant, à ses rendez-vous, reçus et consentements. Il ne voit pas les justificatifs du médecin ni les dossiers d’autres patients.

### Médecin
Accède aux dossiers explicitement associés à sa prise en charge et aux informations que le patient a fournies à cette fin. Il ne voit pas les dossiers d’autres médecins sans transfert accepté par le patient.

### Administrateur de vérification
Accède aux justificatifs professionnels et aux éléments nécessaires à la validation du médecin. Cet accès ne donne pas automatiquement accès aux dossiers médicaux.

### Administrateur support/modération
Accède aux éléments strictement nécessaires pour traiter un signalement, une contestation ou un incident. Toute consultation exceptionnelle d’un contenu de santé doit être autorisée, justifiée, limitée dans le temps et journalisée.

### Développeur et fournisseur technique
Ne doivent pas utiliser des comptes ou dossiers réels à des fins de développement. L’accès de support ou d’exploitation à des données réelles doit être exceptionnel, approuvé et tracé. Les environnements de test doivent utiliser des données synthétiques.

## 5. Authentification et gestion des comptes

- Utiliser une authentification robuste et un stockage de mots de passe adapté; ne jamais enregistrer les mots de passe en clair.
- Vérifier un moyen de contact avant les actions sensibles.
- Permettre la déconnexion et l’expiration des sessions après une période définie.
- Prévoir une protection contre les tentatives répétées, l’énumération des comptes et les abus de code de vérification.
- Recommander ou imposer une authentification renforcée aux administrateurs; les comptes d’administration ne sont jamais partagés.
- Réinitialiser un mot de passe au moyen d’un processus vérifié et expirer les sessions existantes après une réinitialisation sensible.
- Retirer ou suspendre rapidement l’accès d’un compte médecin en cas de justificatif douteux ou de signalement sérieux, selon une procédure documentée.
- Ne jamais autoriser l’utilisateur à choisir lui-même le rôle « administrateur » par une modification d’interface ou de requête.

## 6. Autorisation et sécurité des dossiers

- Chaque lecture, ajout, modification ou suppression doit vérifier le rôle et la relation avec la ressource côté serveur.
- Les identifiants difficiles à deviner ne remplacent pas le contrôle d’accès.
- Les règles d’accès s’appliquent aussi aux fichiers, aperçus, exports, API et notifications.
- Un patient ne peut voir que ses dossiers; un médecin ne voit que les dossiers qui lui sont attribués.
- Un transfert vers un autre médecin est interdit tant que le patient n’a pas accepté le destinataire et les éléments à transmettre.
- Les comptes suspendus perdent les droits d’action dès que la suspension est effective.
- Les actions financières ou administratives importantes exigent un historique attribuable à une personne et une date.

## 7. Consentement et transparence

À la création du dossier, présenter une information compréhensible sur le traitement des données de santé et recueillir le consentement exigé après validation juridique. Distinguer ce consentement des conditions générales et de tout consentement marketing.

Avant une orientation, afficher : le médecin destinataire, la raison, les éléments du dossier à transférer et une action explicite d’acceptation ou de refus. Enregistrer la version du texte présenté, la réponse et la date. Le refus ne transmet rien.

Les avis publics reposent sur un choix volontaire. Avant publication, rappeler que le commentaire est public et déconseiller toute information médicale ou personnelle. Ne pas publier automatiquement des éléments provenant du dossier.

Le patient doit pouvoir consulter ses consentements et obtenir une explication sur la façon de demander l’accès, la correction ou la suppression de ses données, sous réserve des obligations de conservation établies juridiquement.

## 8. Stockage, chiffrement et pièces jointes

- Utiliser des connexions chiffrées pour les communications entre l’application et ses services.
- Chiffrer les données sensibles au stockage avec une gestion des clés séparée et contrôlée.
- Restreindre les fichiers avec des liens temporaires et une vérification d’autorisation à chaque téléchargement.
- Vérifier le type, la taille et le contenu des fichiers; neutraliser les noms de fichiers; empêcher l’exécution de contenu téléversé.
- Conserver les justificatifs et pièces médicales dans un espace non public, distinct des fichiers publics du site.
- Éviter l’enregistrement des messages, pièces médicales et jetons d’accès dans le cache PWA, le stockage local du navigateur ou les journaux techniques.
- Si une fonction hors ligne est mise en place, ne stocker que des éléments publics non sensibles, sauf analyse de risque et protection dédiée validées.
- Protéger les sauvegardes avec les mêmes règles d’accès et de chiffrement; tester la restauration sans exposer de données.

## 9. Notifications et communications

- Une notification push ou SMS ne doit contenir ni diagnostic, ni symptôme, ni contenu de message, ni nom de pièce médicale.
- Utiliser des libellés neutres, par exemple « Vous avez une mise à jour concernant votre dossier ».
- Ne pas inclure de données de santé dans les objets de courriel, les URL, les paramètres de suivi ou les messages d’erreur.
- Vérifier les destinataires et le consentement avant toute communication par un canal externe.
- Les communications publicitaires ne doivent pas être basées sur les pathologies, blessures ou échanges médicaux.

## 10. Paiement et données financières

- Utiliser un prestataire de paiement approprié, avec environnement de test avant production.
- Ne pas stocker les numéros complets de carte, codes de sécurité ou identifiants secrets du portefeuille mobile.
- Confirmer un paiement par notification serveur vérifiée du prestataire; ne pas se fier à la seule page de retour du navigateur.
- Associer une transaction à un dossier ou rendez-vous sans y joindre d’informations médicales dans les libellés visibles par des tiers.
- Rendre la ventilation compréhensible : tarif médecin, commission de 10 %, frais de réservation physique de 500 FCFA et total à payer, selon la règle commerciale finale.
- Protéger les opérations contre la double confirmation, les relectures de notification et les paiements dupliqués.
- Définir avant production la commission, le reversement, les annulations, les remboursements, les réservations expirées et la gestion des litiges.

## 11. Journalisation, surveillance et antifraude

Enregistrer de façon sécurisée les événements nécessaires : connexions et échecs, changements de rôle/statut, validation médicale, consultation administrative exceptionnelle, consentement à un transfert, changement de tarif, réservation, paiement et modération.

Les journaux doivent éviter le contenu des messages et les détails médicaux. Ils sont accessibles aux personnes chargées de la sécurité et conservés selon une durée définie. Détecter les comportements anormaux : tentatives de connexion répétées, création massive de comptes, dépôt de justificatifs en série, abus de réservation, avis répétés ou altération de références de paiement.

Les mesures antifraude ne doivent pas bloquer automatiquement un patient sur la seule base d’un score opaque. Prévoir une explication et une revue humaine pour les blocages ayant un impact important.

## 12. Conservation, correction et fermeture de compte

Avant le lancement, définir par catégorie de données une durée de conservation et une règle de suppression ou d’archivage. Ne pas garder indéfiniment les justificatifs, pièces médicales, conversations et journaux « au cas où ».

Mettre en place des procédures pour les demandes d’accès, de correction, de retrait du consentement, de suppression et de fermeture de compte, en tenant compte des obligations professionnelles ou légales applicables. La réponse au patient doit expliquer les limites éventuelles plutôt que supprimer silencieusement le compte sans traiter les dossiers associés.

La politique de conservation doit être examinée avec le conseil juridique et les professionnels responsables du traitement. Les sauvegardes expirent selon une politique propre et ne doivent pas réintroduire une donnée supprimée dans l’usage courant.

## 13. Prestataires, hébergement et transferts

Avant d’activer un service externe — hébergement, messagerie, analytique, paiement, stockage, support ou IA — documenter les données transmises, la finalité, l’emplacement, les sous-traitants, les accès de support, les mesures de sécurité et la suppression en fin de contrat.

Ne jamais envoyer un dossier médical réel à un outil d’IA, un service d’analyse public, un outil de débogage ou un assistant de développement sans autorisation, base juridique, contrat et évaluation de risque expressément validés. Les intégrations doivent recevoir le minimum de données nécessaire.

La loi sénégalaise n° 2008-12 qualifie et encadre les traitements de données personnelles, prévoit des dispositions spécifiques liées à la santé et traite des transferts vers des pays tiers.[1] La CDP publie des formalités déclaratives et indique des procédures d’autorisation pour certains traitements sensibles, dont la santé.[2] Il faut demander une analyse locale des obligations applicables au modèle réel d’exploitation, aux sous-traitants, à l’hébergement et aux transferts avant mise en production.

## 14. Sécurité médicale et traitement des situations urgentes

- Les écrans de sécurité sont conçus et approuvés par des professionnels de santé connaissant le contexte local.
- Une personne signalant une situation d’urgence ne doit pas être obligée de créer un compte, payer ou attendre une réponse de messagerie pour voir une consigne d’escalade.
- La plateforme ne promet pas un délai de réponse médicale sauf si un service vérifiable est effectivement organisé.
- Pour un choc à la tête suspecté, le produit ne doit pas autoriser la poursuite du jeu ni le retour automatique; les consignes doivent être alignées sur un protocole validé localement.
- La plateforme n’évalue pas à elle seule l’aptitude à participer au basketball.
- Les contacts d’urgence à afficher doivent être confirmés pour le Sénégal avant lancement.

## 15. Réponse aux incidents

Préparer un plan opérationnel avant d’accepter des dossiers réels :

1. Détecter et signaler l’incident au responsable désigné.
2. Contenir l’accès ou l’exposition sans détruire les éléments utiles à l’enquête.
3. Évaluer les données, utilisateurs, comptes et prestataires touchés.
4. Révoquer les sessions, secrets ou accès compromis et sécuriser les systèmes concernés.
5. Décider avec le conseil compétent des notifications obligatoires, personnes à informer et délais applicables.
6. Documenter les causes, mesures prises et améliorations, puis tester les corrections.

Les employés et médecins disposent d’un canal pour signaler une erreur d’accès, un compte usurpé, une fuite ou une tentative de fraude.

## 16. Liste de contrôle avant lancement réel

- [ ] Les rôles et permissions ont été testés sur l’interface et côté serveur.
- [ ] Un patient ne peut pas lire le dossier d’un autre patient en modifiant URL ou identifiant.
- [ ] Un médecin ne voit que les dossiers qui lui sont attribués.
- [ ] Aucun dossier ou justificatif n’est accessible par URL publique.
- [ ] L’orientation ne partage rien avant le consentement explicite.
- [ ] Les notifications ne montrent pas de données de santé.
- [ ] Le mode PWA ne met pas en cache les conversations ou pièces sensibles.
- [ ] Le paiement est confirmé côté serveur et les événements dupliqués sont gérés.
- [ ] L’accès administrateur est renforcé, nominatif et journalisé.
- [ ] Les clés et secrets ne sont pas inclus dans le code source ni dans les journaux.
- [ ] Les données de test sont fictives et ne reprennent pas des cas réels identifiables.
- [ ] Les durées de conservation, demandes utilisateurs et procédure d’incident sont approuvées.
- [ ] Le prestataire d’hébergement, les transferts et les formalités sénégalaises ont été examinés.
- [ ] Les textes d’urgence et le parcours des mineurs sont validés ou désactivés.
- [ ] Les règles de commission, annulation et remboursement sont affichées avant paiement.

## 17. Références réglementaires de départ

[1]: https://www.afapdp.org/wp-content/uploads/2018/05/Senegal-texte-de-loi-2008.pdf "Sénégal — Loi n° 2008-12 sur la protection des données à caractère personnel"
[2]: https://www.cdp.sn/conformite/formalites "Commission de Protection des Données Personnelles du Sénégal — Formalités déclaratives"

# MailDesk

MailDesk est un client e-mail Windows construit avec **Electron + Next.js + TypeScript + Resend**. Son interface reprend les grands principes d'Outlook : dossiers, liste des messages, volet de lecture, rédaction riche, menus Windows natifs, raccourcis et fonctionnement en arrière-plan.

## Fonctionnalités

- réception via Resend Inbound et éléments envoyés via Resend ;
- assistant de première configuration Electron ;
- adresse du compte + clé Resend stockées chiffrées avec `Electron safeStorage` ;
- démarrages suivants directs, sans redemander les identifiants ;
- modification ultérieure de la clé Resend via **Fichier > Paramètres** ;
- stockage des messages dans une base locale SQLite `maildesk.db` ;
- consultation du cache local lorsque Resend ou Supabase est indisponible ;
- hydratation en arrière-plan du contenu des messages reçus pour l'accès hors ligne ;
- synchronisation Supabase push/pull facultative ;
- état lu/non lu, favoris, archives, corbeille et suppression persistés localement ;
- conversations Outlook-like reconstruites avec `Message-ID`, `In-Reply-To` et `References`, synchronisées SQLite/Supabase ;
- liste regroupée avec compteur de messages et volet de conversation repliable ;
- lecture HTML ou texte dans un `iframe` sandboxé ;
- nouveau message, Cc/Cci, réponse, réponse à tous et transfert avec conservation du thread RFC ;
- éditeur riche Tiptap/ProseMirror : gras, italique, souligné, barré, listes, citations, alignement, liens, émojis, undo/redo et raccourcis clavier ;
- saisie LTR stable sans reset du curseur ;
- brouillon actif sauvegardé automatiquement dans SQLite, pièces jointes incluses, avec migration de l'ancien brouillon `localStorage` ;
- plusieurs identités d'envoi Resend, chacune avec son adresse et sa signature, avec sélection du champ **De** dans le composeur ;
- réponse automatique avec l'identité qui avait reçu le message lorsque l'adresse correspond ;
- signature automatique configurable par identité ;
- lecture HTML protégée : images distantes de tracking bloquées par défaut, CSP stricte et liens externes sans référent ;
- bouton de chargement des images distantes message par message ;
- pièces jointes à l'envoi et téléchargement des pièces jointes reçues ;
- impression d'un mail ou d'une conversation complète ;
- export PDF sécurisé de la conversation, sans chargement des ressources distantes de tracking ;
- export EML du message sélectionné avec headers de thread et pièces jointes Resend intégrées en MIME ;
- boîte d'envoi SQLite hors ligne avec retry automatique, édition/suppression et clés d'idempotence Resend pour éviter les doublons ;
- recherche plein texte locale SQLite FTS5 dans sujet, expéditeur, destinataires, corps et pièces jointes, disponible hors ligne ;
- recherche avancée combinable : `from:`, `to:`, `subject:`, `has:attachment`, `before:`, `after:`, `is:`, `category:`, `folder:` ;
- dossiers personnalisés SQLite/Supabase avec compteurs, renommage, suppression sûre, drag & drop et déplacement depuis le menu contextuel ;
- carnet de contacts SQLite appris automatiquement depuis les correspondants, enrichi avec société, téléphone, tags, notes, favoris et édition complète ;
- auto-complétion À/Cc/Cci classée par favoris, fréquence et récence, avec navigation clavier ;
- modèles et réponses rapides persistés dans SQLite/Supabase et insérables directement depuis le composeur ;
- calendrier local avec création/édition d'événements, participants, lieu, import ICS et export ICS ;
- règles automatiques locales sur expéditeur, objet ou destinataire vers Archives, Favoris, Lu, Corbeille ou un dossier personnalisé ;
- filtres et tri ;
- menu contextuel Windows au clic droit ;
- barre de menu Electron masquée ; l'interface conserve les raccourcis utiles sans menu natif visible ;
- multi-fenêtres : double-clic ou bouton **Fenêtre** pour détacher plusieurs messages simultanément ;
- notifications Windows avec actions **Ouvrir** et **Marquer lu** ;
- intégration Windows : démarrage à l'ouverture de session, gestionnaire `mailto:`, instance unique et compteur non lu dans l'infobulle du tray ;
- auto-update facultatif par manifest HTTPS, téléchargement du Setup et validation SHA-256 avant installation ;
- sauvegarde/restauration SQLite complète depuis Paramètres ou le menu Fichier, avec copie de sécurité automatique avant restauration ;
- accès direct au dossier de données local et affichage de la version installée ;
- serveur Next.js embarqué dans la version packagée.

## Première ouverture Windows

Si aucun compte n'a encore été configuré, Electron affiche une fenêtre dédiée avant MailDesk. Elle demande :

- l'adresse d'envoi, par exemple `MailDesk <mail@domaine.fr>` ;
- la clé API Resend `re_...`.

Ces valeurs sont enregistrées dans le profil Windows de MailDesk sous forme d'un blob chiffré avec `safeStorage`. Le fichier de configuration ne contient donc pas la clé API en clair. Une fois la configuration enregistrée, les prochains lancements ouvrent directement la boîte mail.

La configuration peut ensuite être modifiée depuis l'icône **engrenage**. Les paramètres utilisent une navigation latérale par onglets ; chaque onglet affiche une disquette qui devient bleue uniquement lorsqu'il contient des modifications non enregistrées.

## Base locale SQLite

MailDesk crée automatiquement :

```text
%APPDATA%\resend-webmail\maildesk.db
```

Le chemin exact apparaît également dans les paramètres du client. La base locale conserve les messages, les états utilisateur, le brouillon actif, la boîte d'envoi, les contacts et les règles automatiques. Elle reste utilisable lorsque Supabase n'est pas configuré.

Le brouillon est enregistré avec un debounce court dans la table SQLite `drafts`, y compris les pièces jointes. Fermer la fenêtre de rédaction conserve immédiatement le brouillon ; un envoi réussi le supprime. Au premier lancement après mise à jour, un ancien brouillon `localStorage` est migré vers SQLite.

Après récupération de la liste Resend, MailDesk met en cache les résumés puis récupère en arrière-plan les corps des messages reçus qui ne sont pas encore présents localement.

### Sauvegarde locale

Depuis **Fichier > Exporter une sauvegarde** ou **Paramètres > Données locales & sauvegarde**, MailDesk crée un snapshot SQLite cohérent via `VACUUM INTO`. Il contient l'ensemble des données locales : messages, conversations, états, brouillons, boîte d'envoi, contacts, règles, catégories, snooze et expéditeurs bloqués.

Les secrets Resend/Supabase ne sont pas inclus : ils restent dans le fichier de paramètres chiffré par `safeStorage`.

Lors d'une restauration, MailDesk vérifie d'abord l'intégrité SQLite et la présence des tables attendues, puis crée automatiquement une copie `maildesk-pre-restore-<date>.db` de la base actuelle avant remplacement.

### Conversations et threading

MailDesk utilise les identifiants RFC du courrier pour reconstruire les échanges :

- `Message-ID` identifie chaque message ;
- `In-Reply-To` pointe vers le message auquel on répond ;
- `References` conserve la chaîne complète de la conversation.

Les mails reçus extraient ces valeurs depuis les headers exposés par Resend. Pour les mails envoyés, MailDesk conserve localement le parent et la chaîne de références au moment de l'envoi, y compris pour les messages qui passent par la boîte d'envoi hors ligne. Les réponses utilisent ensuite les mêmes headers lors de l'envoi afin que MailDesk, Outlook, Gmail et les autres clients compatibles regroupent le fil de manière cohérente.

La liste de courrier affiche une seule ligne par conversation avec un compteur. Le volet de lecture affiche ensuite chaque message sous forme de carte repliable, avec le message le plus récent ouvert en premier. Les anciennes bases SQLite sont migrées automatiquement et les métadonnées déjà présentes dans `remote_payload` sont récupérées au démarrage.

### Contacts et auto-complétion

La table SQLite `contacts` est alimentée automatiquement à partir des expéditeurs reçus et des destinataires utilisés dans les mails envoyés. MailDesk reconstruit le score de fréquence depuis l'historique au démarrage pour éviter qu'un simple refresh augmente artificiellement le classement.

Le carnet **Contacts** permet aussi d'ajouter ou modifier un contact manuellement, de renseigner sa société, son téléphone, des tags et des notes internes, de le mettre en favori et de lancer directement une rédaction. Un contact appris puis supprimé reste masqué même si son adresse existe toujours dans l'historique local.

Dans les champs **À / Cc / Cci**, MailDesk propose les contacts selon les favoris, la fréquence d'échange et la récence. Les suggestions supportent les flèches haut/bas, Entrée et Échap.

### Modèles et réponses rapides

L'onglet **Paramètres > Modèles** permet de créer des réponses réutilisables avec :

- nom ;
- raccourci lisible, par exemple `/devis` ;
- objet proposé ;
- version texte ;
- version HTML.

Les modèles sont stockés localement dans SQLite, synchronisés avec Supabase lorsqu'il est configuré et proposés directement dans le composeur via **Réponse rapide**.

### Calendrier et ICS

Le bouton **Calendrier** de la barre latérale ouvre l'agenda local MailDesk. Chaque événement peut contenir un titre, un début, une fin, un lieu, une description et des participants.

MailDesk sait importer un fichier `.ics` contenant des événements `VEVENT` et exporter l'agenda local dans un fichier iCalendar compatible avec Outlook, Google Calendar, Apple Calendar et les autres logiciels prenant en charge ICS.

### Multi-fenêtres

Un double-clic sur un message ou le bouton **Fenêtre** du volet de lecture ouvre une fenêtre Electron indépendante. Plusieurs messages peuvent donc rester ouverts simultanément pendant que la fenêtre principale continue d'être utilisée.

La fenêtre détachée conserve la lecture HTML sécurisée, les pièces jointes et les commandes Imprimer / PDF / EML.

### Règles automatiques

Dans **Paramètres > Règles automatiques**, une règle peut tester l'expéditeur, l'objet ou le destinataire avec les opérateurs **contient**, **est exactement** ou **se termine par**. Les actions disponibles sont :

- Archiver ;
- Ajouter aux favoris ;
- Marquer comme lu ;
- Déplacer dans la corbeille ;
- Déplacer vers un dossier personnalisé.

Les suppressions de règles et de dossiers utilisent des tombstones synchronisés afin qu'un élément supprimé sur un poste ne réapparaisse pas lors d'un pull Supabase depuis un autre poste.

Les règles actives s'exécutent lors de l'arrivée d'un nouveau message. Le bouton **Appliquer aux messages existants** permet volontairement un traitement rétroactif sans réexécuter les règles à chaque actualisation.

### Recherche locale et recherche avancée

Une table virtuelle SQLite FTS5 est maintenue à partir de la table `messages`. La barre de recherche interroge donc localement le sujet, l'expéditeur, les destinataires, le corps HTML/texte et les métadonnées de pièces jointes. L'index est reconstruit automatiquement au démarrage pour assurer la migration depuis les anciennes versions.

La recherche est globale sur la boîte locale et accepte plusieurs filtres combinables :

```text
from:client@domaine.fr
to:support@domaine.fr
subject:"devis signé"
has:attachment
is:unread
is:read
is:starred
is:inbound
is:outbound
before:2026-09-01
after:2026-08-01
category:blue
folder:"Factures"
```

Du texte libre peut être mélangé avec ces filtres, par exemple `contrat from:client@domaine.fr after:2026-09-01 has:attachment`.

### Dossiers personnalisés

La section **Mes dossiers** de la barre latérale permet de créer, renommer et supprimer des dossiers locaux. Un message peut être déplacé vers un dossier par drag & drop ou via **clic droit > Déplacer vers**.

La suppression d'un dossier replace automatiquement les messages reçus en Réception et les messages sortants dans Éléments envoyés. Les règles ciblant le dossier supprimé sont également désactivées par suppression synchronisée.

### Impression et exports

Dans le volet de lecture, **Imprimer**, **PDF** et **EML** permettent de sortir le courrier hors de MailDesk :

- l'impression et le PDF reprennent toute la conversation actuellement ouverte ;
- les documents d'impression utilisent une CSP restrictive et n'autorisent aucune ressource distante, ce qui évite de déclencher des pixels de tracking pendant l'export ;
- l'export EML concerne le message sélectionné et reproduit les headers `Message-ID`, `In-Reply-To` et `References` ;
- les pièces jointes reçues sont téléchargées via Resend au moment de l'export et ajoutées comme parties MIME encodées en base64.

Le menu Windows **Message > Imprimer** est également disponible avec `Ctrl+P`.

### Boîte d'envoi hors ligne

En cas de coupure réseau, timeout, rate limit ou erreur serveur temporaire, MailDesk place le message dans la table SQLite `outbox`. Le client retente au démarrage, au retour de la connexion, lors des actualisations et périodiquement en arrière-plan. Les délais augmentent progressivement jusqu'à 30 minutes.

Chaque message en file conserve sa clé d'idempotence Resend ; les retries réutilisent exactement la même clé afin d'éviter les doubles envois. Une erreur permanente (clé invalide, destinataire invalide, etc.) n'est pas automatiquement mise en file par le renderer.

Depuis **Boîte d'envoi**, il est possible de rouvrir le message pour le modifier, de retenter immédiatement ou de le supprimer.

## Synchronisation Supabase facultative

Dans **Paramètres > Synchronisation Supabase**, MailDesk peut maintenant configurer automatiquement une instance Supabase existante.

Renseigner :

- **URL du projet** : `https://<project-ref>.supabase.co` ;
- **Project Ref** : facultatif si l'URL standard permet de le détecter automatiquement ;
- **clé de synchronisation** : de préférence une clé secrète moderne `sb_secret_...`, ou l'ancien `service_role` JWT ;
- **token Supabase Management API** `sbp_...` disposant de la permission `database_write`.

Le bouton **Créer / réparer les tables** envoie le schéma MailDesk à l'API de gestion Supabase, crée ou met à jour `public.maildesk_messages`, `public.maildesk_contacts`, `public.maildesk_folders` et `public.maildesk_rules`, vérifie ensuite la Data API et lance une première synchronisation. **Enregistrer** déclenche aussi automatiquement cette initialisation lorsque tous les identifiants nécessaires sont présents.

Le schéma embarqué se trouve dans :

```text
supabase\maildesk_messages.sql
```

Les quatre tables activent RLS et ne donnent aucun accès aux rôles publics `anon` / `authenticated`. La synchronisation administrative utilise donc la clé secrète configurée. Tous les secrets sont stockés dans le blob chiffré `safeStorage` du profil Windows et ne sont jamais exposés au renderer.

La synchronisation effectue un pull des données distantes puis un upsert de l'état local selon `updated_at` pour les messages, contacts, dossiers et règles. Sur une ancienne instance Supabase ne contenant encore que `maildesk_messages`, les mails continuent d'être synchronisés ; **Créer / réparer les tables** active ensuite la synchro Contacts/Dossiers/Règles. La base SQLite reste disponible en permanence comme cache hors ligne.

> Cette configuration avec clé secrète convient surtout à une installation privée sur un poste Windows de confiance. Pour distribuer MailDesk à plusieurs utilisateurs non fiables, utiliser plutôt Supabase Auth + RLS par utilisateur ou une API de synchronisation intermédiaire.

## Identités et signatures multiples

Dans **Paramètres > Identités d’envoi**, MailDesk conserve une ou plusieurs identités dans le profil chiffré `safeStorage`.

Chaque identité possède :

- un nom d’affichage ;
- une adresse `From` Resend ;
- sa propre signature ;
- un état **Par défaut**.

Le composeur affiche un champ **De** permettant de changer d’identité. Lors d’une réponse à un message reçu sur une adresse secondaire, MailDesk tente de sélectionner automatiquement l’identité correspondante. Le brouillon SQLite et la boîte d’envoi hors ligne conservent également l’adresse d’expédition choisie.

La configuration historique `from + signature` est migrée automatiquement en identité **Principal**.

## Protection du contenu distant

Les mails HTML sont affichés dans un `iframe` sandboxé avec une politique CSP injectée par MailDesk.

Par défaut :

- les images `http/https` distantes sont bloquées afin de limiter les pixels de tracking ;
- les connexions réseau, frames, objets et soumissions de formulaires provenant du contenu du mail sont interdites ;
- les scripts du mail ne sont pas autorisés ;
- aucun référent n’est envoyé lors de l’ouverture d’un lien ;
- les liens sont forcés en ouverture externe dans le navigateur / gestionnaire Windows.

Lorsqu’un mail contient des ressources distantes, un bandeau **Charger les images** permet de les autoriser uniquement pour ce message pendant la session.

## Intégration Windows

Dans **Paramètres > Intégration Windows**, la version installée peut :

- démarrer automatiquement avec la session Windows ;
- s’enregistrer comme gestionnaire `mailto:` ;
- réutiliser l’instance MailDesk déjà ouverte au lieu de lancer plusieurs processus.

Un lien tel que :

```text
mailto:client@example.fr?subject=Devis&body=Bonjour
```

ouvre le composeur avec le destinataire, l’objet et le corps préremplis, puis applique la signature de l’identité par défaut. Le tray affiche également le nombre de messages non lus dans son infobulle.

## Signature et rédaction riche

Dans **Paramètres > Signature automatique**, saisir la signature qui doit être insérée dans les nouveaux messages, réponses et transferts.

La fenêtre de rédaction utilise **Tiptap 3 / ProseMirror** avec rendu différé compatible Next.js. Elle prend en charge :

- gras, italique, souligné et barré ;
- listes à puces et numérotées ;
- citations ;
- alignement gauche / centre / droite ;
- liens ;
- émojis ;
- undo / redo natifs ;
- copier/coller et raccourcis clavier gérés par ProseMirror ;
- pièces jointes ;
- signature automatique ;
- envoi HTML + alternative texte.

## Mises à jour automatiques

L'onglet **Paramètres > Mises à jour** peut utiliser un manifest JSON hébergé en HTTPS. Le client compare la version, télécharge le Setup dans le profil local, vérifie son SHA-256 puis affiche une notification Windows avec **Installer** / **Plus tard**.

Format du manifest :

```json
{
  "version": "0.4.1",
  "url": "https://votre-domaine.fr/MailDesk-Setup-0.4.1-x64.exe",
  "sha256": "SHA256_HEXADECIMAL_64_CARACTERES",
  "notes": "Corrections et améliorations"
}
```

L'URL du Setup doit elle aussi utiliser HTTPS. Le fichier téléchargé n'est proposé à l'installation que si son SHA-256 correspond exactement au manifest.

## Actions du clic droit

Sur un message : Répondre, Répondre à tous, Transférer, Marquer lu/non lu, Favori, Archiver, Supprimer, Restaurer et Supprimer définitivement.

## Raccourcis principaux

| Action | Raccourci |
| --- | --- |
| Nouveau message | `Ctrl+N` |
| Répondre | `Ctrl+R` |
| Répondre à tous | `Ctrl+Shift+R` |
| Transférer | `Ctrl+F` |
| Recherche | `Ctrl+E` |
| Archiver | `Ctrl+Shift+A` |
| Marquer non lu | `Ctrl+U` |
| Favori | `Ctrl+Shift+G` |
| Actualiser | `F5` |
| Boîte de réception | `Ctrl+1` |
| Éléments envoyés | `Ctrl+2` |
| Contacts | `Ctrl+5` |
| Archives | `Ctrl+3` |
| Corbeille | `Ctrl+4` |
| Supprimer le message sélectionné | `Suppr` |

## Développement

```powershell
cd D:\Dev\resend-webmail
npm install
npm run electron:dev
```

Pour le mode navigateur, utiliser les variables :

```env
RESEND_API_KEY=re_xxxxxxxxx
RESEND_FROM="MailDesk <mail@domaine.fr>"
```

## Validation

```powershell
npm run lint
npm run build
```

## Construire le client Windows

```powershell
npm run electron:dir
npm run electron:build
```

Sorties :

```text
dist-electron\win-unpacked\MailDesk.exe
release-0.4.0\MailDesk-Setup-0.4.0-x64.exe
```

## Architecture

```text
electron/
  main.cjs           Processus principal, onboarding, IPC et serveur Next embarqué
  setup.html         Assistant de première configuration
  setup-preload.cjs  Bridge IPC limité à l'onboarding
  preload.cjs        Bridge IPC sécurisé du client
  settings.cjs       Configuration chiffrée safeStorage
  db.cjs             Base locale SQLite
  sync.cjs           Synchronisation Supabase facultative
  supabase-provision.cjs  Bootstrap automatique via Management API
  updater.cjs        Vérification HTTPS, téléchargement et contrôle SHA-256 des mises à jour
  menu.cjs           Raccourcis/menu contextuel Windows

src/app/
  page.tsx           Interface MailDesk
  window/mail/       Fenêtre de lecture détachée
  api/mail/          API locale Resend

src/components/mail/
  rich-text-editor.tsx  Éditeur Tiptap/ProseMirror

supabase/
  maildesk_messages.sql
```

Le renderer utilise `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` et n'accède jamais directement aux clés stockées.

## Remarque sur la suppression

Resend reste le transport et l'historique distant. Une suppression définitive dans MailDesk marque le message comme supprimé dans la base locale et dans la synchronisation MailDesk ; elle ne prétend pas supprimer un historique distant lorsque le fournisseur ne propose pas l'opération correspondante.

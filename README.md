# MailDesk

MailDesk est un client e-mail Windows construit avec **Electron + Next.js + TypeScript + Resend**. Son interface reprend les grands principes d’un client de messagerie moderne : dossiers, liste des messages, volet de lecture, rédaction riche, raccourcis clavier, intégration Windows et fonctionnement en arrière-plan.

## Fonctionnalités

- réception via Resend Inbound et éléments envoyés via Resend ;
- assistant de première configuration Electron ;
- adresse du compte + clé Resend stockées chiffrées avec `Electron safeStorage` ;
- démarrages suivants directs, sans redemander les identifiants ;
- modification ultérieure de la clé Resend via **Paramètres > Compte** ;
- stockage des messages dans une base locale SQLite `maildesk.db` ;
- consultation du cache local lorsque Resend ou Supabase est indisponible ;
- hydratation en arrière-plan du contenu des messages reçus pour l'accès hors ligne ;
- synchronisation Supabase push/pull facultative ;
- état lu/non lu, favoris, archives, corbeille et suppression persistés localement ;
- conversations reconstruites avec `Message-ID`, `In-Reply-To` et `References`, synchronisées SQLite/Supabase ;
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
- liste de courrier avec regroupement **chronologique / jour / semaine / mois**, sections repliables et groupe **Épinglés** ;
- sélection multiple activable avec sélection totale et actions groupées ;
- drapeau **Important**, épingle persistante et suppression rapide directement sur chaque ligne ;
- dossiers personnalisés SQLite/Supabase affichés directement sous **Boîte de réception**, création inline, compteurs, renommage, suppression sûre et ordre manuel par glisser-déposer ;
- carnet de contacts SQLite appris automatiquement depuis les correspondants, enrichi avec société, téléphone, tags, notes, favoris et édition complète ;
- auto-complétion À/Cc/Cci classée par favoris, fréquence et récence, avec navigation clavier ;
- modèles et réponses rapides persistés dans SQLite/Supabase et insérables directement depuis le composeur ;
- calendrier local avec création/édition d'événements, participants, lieu, import ICS et export ICS ;
- règles automatiques locales sur expéditeur, objet ou destinataire vers Archives, Favoris, Lu, Corbeille ou un dossier personnalisé ;
- création de règle directement depuis un message (expéditeur, objet ou destinataire), préremplie dans l'onglet Règles ;
- actualisation automatique configurable de **5 secondes à 1 heure**, sans clignotement de chargement en arrière-plan ;
- onglets de lecture/rédaction dans le volet droit : mail courant non fermable + plusieurs onglets Nouveau/Réponse/Transfert/Brouillon indépendants et fermables ;
- bouton disquette dans le composeur pour forcer immédiatement la création ou la mise à jour du brouillon ;
- filtres et tri ;
- menu contextuel Windows au clic droit ;
- barre de menu Electron masquée ; l'interface conserve les raccourcis utiles sans menu natif visible, avec aide `?` à côté du statut Resend ;
- multi-fenêtres : double-clic ou bouton **Fenêtre** pour détacher plusieurs messages simultanément ;
- notifications Windows avec actions **Ouvrir** et **Marquer lu** ;
- intégration Windows : démarrage à l'ouverture de session, gestionnaire `mailto:`, instance unique et compteur non lu dans l'infobulle du tray ;
- thèmes couleur personnalisables avec préréglages et couleur hexadécimale libre, prévisualisés en direct puis sauvegardés dans les paramètres chiffrés ;
- auto-update facultatif par manifest HTTPS, téléchargement du Setup et validation SHA-256 avant installation ;
- sauvegarde/restauration SQLite complète depuis **Paramètres > Données**, avec copie de sécurité automatique avant restauration ;
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

Depuis **Paramètres > Données**, MailDesk crée un snapshot SQLite cohérent via `VACUUM INTO`. Il contient l'ensemble des données locales : messages, conversations, états, brouillons, boîte d'envoi, contacts, règles, catégories, snooze et expéditeurs bloqués.

Les secrets Resend/Supabase ne sont pas inclus : ils restent dans le fichier de paramètres chiffré par `safeStorage`.

Lors d'une restauration, MailDesk vérifie d'abord l'intégrité SQLite et la présence des tables attendues, puis crée automatiquement une copie `maildesk-pre-restore-<date>.db` de la base actuelle avant remplacement.

### Conversations et threading

MailDesk utilise les identifiants RFC du courrier pour reconstruire les échanges :

- `Message-ID` identifie chaque message ;
- `In-Reply-To` pointe vers le message auquel on répond ;
- `References` conserve la chaîne complète de la conversation.

Les mails reçus extraient ces valeurs depuis les headers exposés par Resend. Pour les mails envoyés, MailDesk conserve localement le parent et la chaîne de références au moment de l'envoi, y compris pour les messages qui passent par la boîte d'envoi hors ligne. Les réponses utilisent ensuite les mêmes headers lors de l'envoi afin que MailDesk et les autres clients compatibles regroupent le fil de manière cohérente.

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

MailDesk sait importer un fichier `.ics` contenant des événements `VEVENT` et exporter l'agenda local dans un fichier iCalendar compatible avec les logiciels prenant en charge le standard ICS.

### Multi-fenêtres

Un double-clic sur un message ou le bouton **Fenêtre** du volet de lecture ouvre une fenêtre Electron indépendante. Plusieurs messages peuvent donc rester ouverts simultanément pendant que la fenêtre principale continue d'être utilisée.

La fenêtre détachée conserve la lecture HTML sécurisée et les pièces jointes, mais fonctionne désormais comme une vraie fenêtre de travail : Répondre, Répondre à tous, Transférer, choix d’identité, signature avec image, Cc/Cci, pièces jointes, brouillon local, envoi hors ligne, archive, suppression, favoris, drapeau et épingle. Imprimer / PDF / EML restent disponibles.

### Règles automatiques V2

Dans **Paramètres > Règles automatiques**, une règle peut combiner jusqu'à 10 conditions et 10 actions. Les conditions portent sur l'expéditeur, l'objet ou le destinataire avec les opérateurs **contient**, **est exactement** ou **se termine par**. Elles peuvent être combinées en mode **ET** (toutes les conditions) ou **OU** (au moins une condition).

Les actions disponibles sont :

- Archiver ;
- Ajouter aux favoris ;
- Marquer comme lu ;
- Déplacer dans la corbeille ;
- Déplacer vers un dossier personnalisé, avec **Créer le dossier...** directement dans le sélecteur de la règle ;
- Appeler un webhook HTTP/HTTPS externe.

Chaque règle possède une priorité numérique. Une option **Arrêter les règles suivantes** permet d'interrompre le traitement dès qu'une règle prioritaire correspond. Plusieurs actions peuvent être exécutées par la même règle.

Le bouton **Tester sans appliquer** mesure combien de messages locaux correspondent et affiche quelques exemples, sans modifier la boîte. L'activité des règles est journalisée localement pour faciliter le diagnostic. Le bouton **Appliquer aux messages existants** permet toujours un traitement rétroactif.

Les webhooks sont envoyés en POST JSON via une file SQLite persistante avec déduplication et retry progressif. L'URL du webhook reste volontairement locale à MailDesk et n'est pas synchronisée vers Supabase.

Les suppressions de règles et de dossiers utilisent des tombstones synchronisés afin qu'un élément supprimé sur un poste ne réapparaisse pas lors d'un pull Supabase depuis un autre poste.

Depuis un message reçu, **clic droit > Créer une règle** propose **Depuis cet expéditeur**, **Objet contient** ou **Pour ce destinataire**. Le constructeur V2 s'ouvre alors prérempli et peut ensuite être enrichi avec d'autres conditions ou actions.

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

Les états `is:flagged` et `is:pinned` permettent aussi de retrouver les messages marqués importants ou épinglés.

### Actualisation automatique

Le bouton d'actualisation manuelle se trouve dans l'en-tête du panneau **Courrier**, immédiatement à gauche du nom du dossier courant (par exemple **Boîte de réception**). La relève automatique se règle dans **Paramètres > Actualisation** avec un curseur discret :

- 5 s ;
- 10 s ;
- 30 s ;
- 1 min ;
- 5 min ;
- 10 min ;
- 30 min ;
- 1 h.

Une relève à 5–10 secondes est possible mais l'interface avertit qu'elle augmente fortement le nombre de requêtes. La relève automatique est exécutée par le **process Electron principal**, et non par React : elle continue donc même si la fenêtre est réduite ou masquée. Electron compare les identifiants Resend avec **tous** les identifiants connus de SQLite, y compris les tombstones des messages supprimés localement : un ancien mail conservé par Resend ne peut donc plus redevenir artificiellement « nouveau » à chaque poll. S'il n'y a aucun nouvel identifiant, aucune écriture SQLite, synchronisation Supabase ou mise à jour de l'interface n'est déclenchée. Lorsqu'un vrai nouveau mail arrive, les règles et blocages sont appliqués d'abord ; la notification Windows n'est émise que si le message reste ensuite dans la **boîte de réception locale et non lu**.

### Onglets de lecture et rédaction

Le volet de lecture possède maintenant une barre d'onglets au-dessus de sa barre d'outils. L'onglet du mail sélectionné reste ouvert et ne comporte pas de bouton de fermeture. Chaque **Nouveau message**, **Réponse**, **Réponse à tous**, **Transfert** ou **Brouillon** crée son propre onglet de rédaction indépendant.

Plusieurs rédactions peuvent donc rester ouvertes simultanément. Cliquer sur un onglet restaure son destinataire, son objet, son contenu, ses pièces jointes et son contexte de réponse/transfert. Fermer un onglet de rédaction conserve son brouillon ; la disquette **Brouillon** permet de le sauvegarder immédiatement. Démarrer un nouveau message ne remplace plus une réponse ou un transfert déjà ouvert.

### Liste des messages, regroupements et sélection multiple

La liste de courrier peut être regroupée selon plusieurs modes :

- **Chronologique** : Épinglés, Aujourd’hui, Hier, Cette semaine, La semaine dernière, Ce mois-ci, Le mois dernier et Plus ancien ;
- **Jour** : une section par date ;
- **Semaine** : une section par semaine ;
- **Mois** : une section par mois ;
- **Aucun groupe** : liste continue.

Les sections peuvent être repliées avec leur chevron. L’action **Sélection** active les cases de sélection multiple ; `Ctrl+A` sélectionne les conversations visibles et `Échap` quitte ce mode. La barre groupée permet ensuite de supprimer, marquer important ou épingler plusieurs messages.

Chaque ligne dispose aussi d’actions rapides pour lu/non lu, drapeau **Important**, épingle et corbeille. Un message épinglé remonte dans la section **Épinglés**.

### Apparence et thèmes

L'onglet **Paramètres > Apparence** permet de personnaliser la couleur principale de MailDesk. Plusieurs préréglages sont fournis (Bleu, Violet, Émeraude, Orange, Rose et Ardoise) et un sélecteur permet d'utiliser n'importe quelle couleur hexadécimale.

Le thème est prévisualisé immédiatement. La disquette de l'onglet enregistre la couleur dans les paramètres chiffrés ; fermer les paramètres sans enregistrer restaure le thème précédent. La couleur est également appliquée aux fenêtres de lecture détachées.

### Dossiers personnalisés

Les dossiers personnalisés apparaissent directement sous **Boîte de réception** dans la barre latérale. Le bouton **+ dossier** ouvre un champ de création inline : Entrée crée le dossier et Échap annule.

Les dossiers peuvent être réordonnés par glisser-déposer. Cet ordre est conservé dans SQLite et synchronisé avec Supabase via le champ `sort_order`. Un message peut être déplacé vers un dossier en le faisant glisser sur le dossier ou via **clic droit > Déplacer vers**. Un mail déposé sur **Boîte de réception** est replacé dans la réception.

La suppression d'un dossier replace automatiquement les messages reçus en Réception et les messages sortants dans Éléments envoyés. Les règles ciblant le dossier supprimé sont également désactivées par suppression synchronisée.

### Impression et exports

Dans le volet de lecture, **Imprimer**, **PDF** et **EML** permettent de sortir le courrier hors de MailDesk :

- l'impression et le PDF reprennent toute la conversation actuellement ouverte ;
- les documents d'impression utilisent une CSP restrictive et n'autorisent aucune ressource distante, ce qui évite de déclencher des pixels de tracking pendant l'export ;
- l'export EML concerne le message sélectionné et reproduit les headers `Message-ID`, `In-Reply-To` et `References` ;
- les pièces jointes reçues sont téléchargées via Resend au moment de l'export et ajoutées comme parties MIME encodées en base64.

L'impression est également accessible directement avec `Ctrl+P`.

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
- **token Supabase Management API** `sbp_...` avec `database_write`, `api_gateway_keys_read` et `edge_functions_write` si vous utilisez aussi le mobile via Edge.

Le bouton **Créer / réparer les tables** envoie le schéma MailDesk à l'API de gestion Supabase, crée ou met à jour `public.maildesk_messages`, `public.maildesk_contacts`, `public.maildesk_folders` et `public.maildesk_rules`, vérifie ensuite la Data API et lance une première synchronisation. **Enregistrer** déclenche aussi automatiquement cette initialisation lorsque tous les identifiants nécessaires sont présents.

Le schéma embarqué se trouve dans :

```text
supabase\maildesk_messages.sql
```

Les quatre tables activent RLS et ne donnent aucun accès aux rôles publics `anon` / `authenticated`. La synchronisation administrative utilise donc la clé secrète configurée. Tous les secrets sont stockés dans le blob chiffré `safeStorage` du profil Windows et ne sont jamais exposés au renderer.

La synchronisation V5 est **différentielle**. Pour les messages, MailDesk conserve un curseur `updated_at`, ne récupère que la fenêtre distante récente et n'envoie que les lignes SQLite réellement modifiées depuis leur dernière synchronisation (`synced_at`). Les contacts, dossiers, modèles, calendrier et règles ne sont poussés que lorsque leur `updated_at` local est plus récent que la version distante. Un verrou empêche deux synchronisations de s'exécuter simultanément. Sur une ancienne instance Supabase, les mails restent synchronisés et les règles simples gardent leur compatibilité ; **Créer / réparer les tables** ajoute les colonnes nécessaires aux règles V2 afin de synchroniser conditions multiples, actions multiples, priorité et arrêt de traitement. Les règles contenant un webhook restent locales. La base SQLite reste disponible en permanence comme cache hors ligne.

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

Dans **Paramètres > Compte**, chaque identité dispose de sa signature. L’éditeur accepte du texte et des images redimensionnables ; les images intégrées sont converties en pièces inline CID à l’envoi pour rester compatibles avec les clients e-mail.

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
  "version": "0.4.6",
  "url": "https://votre-domaine.fr/MailDesk-Setup-0.4.6-x64.exe",
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
release-0.4.5\MailDesk-Setup-0.4.5-x64.exe
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

## Client mobile Android / iOS

MailDesk expose maintenant les mêmes routes Resend au client Expo, sans exposer les secrets du desktop. En exécution locale Electron, les routes continuent de fonctionner comme avant. En environnement hébergé (Vercel ou `MAILDESK_REQUIRE_REMOTE_AUTH=1`), chaque requête `/api/mail/*` et `/api/mobile/*` exige une session Supabase valide.

Le backend valide le bearer token auprès de Supabase Auth puis vérifie une allowlist serveur :

```env
MAILDESK_MOBILE_ALLOWED_EMAILS=utilisateur@entreprise.fr
# ou
MAILDESK_MOBILE_ALLOWED_USER_IDS=uuid-supabase
```

Au moins une des deux allowlists est obligatoire en mode distant. Les variables serveur nécessaires sont documentées dans `mobile-server.env.example`.

L'application Expo utilise uniquement des valeurs publiques : URL Supabase, clé `publishable`/`anon` et URL de l’Edge Function MailDesk. `RESEND_API_KEY`, les clés Supabase `service_role` / `sb_secret` et le token Management API ne doivent jamais être copiés dans l'APK ou l'IPA.

### Provisionnement mobile par QR

Dans **Paramètres > Supabase**, aucune URL de backend mobile supplémentaire n'est nécessaire lorsque MailDesk utilise Supabase Edge. L'URL est calculée automatiquement sous la forme `https://<project-ref>.supabase.co/functions/v1/maildesk-api`. Le wiki intégré permet de créer/réparer les tables et de **créer / mettre à jour l’API Edge** depuis le token Management API. Le source embarqué est `supabase/functions/maildesk-api/index.ts`.

L’Edge Function requiert les secrets `RESEND_API_KEY`, `RESEND_FROM` et au moins une allowlist `MAILDESK_MOBILE_ALLOWED_EMAILS` ou `MAILDESK_MOBILE_ALLOWED_USER_IDS`. `MAILDESK_MOBILE_SIGNATURE_HTML` reste optionnel. Ces valeurs se configurent dans Supabase Edge Functions > Secrets et ne sont jamais placées dans le QR.

Le bouton **QR de connexion mobile** récupère automatiquement la clé Supabase publishable/anon depuis le projet et génère localement un QR versionné `maildesk.mobile.provision/v1`. Le même QR est accessible depuis l'icône **QR code** à côté du statut Resend en bas à gauche. Le QR contient uniquement l'URL Supabase, la clé publique client et l'URL Edge calculée ; il ne contient aucun mot de passe, aucune clé Resend et aucune clé Supabase secrète.

MailDesk Mobile scanne ce QR avec `expo-camera`, stocke la configuration dans SecureStore puis ouvre l'écran de connexion Supabase. Une même APK/IPA peut donc être provisionnée pour différents environnements sans rebuild.

### Pièces jointes : lien direct uniquement

Les pièces jointes ne sont jamais chargées dans Supabase Storage ni synchronisées en base64. Supabase ne conserve que les métadonnées utiles (`id`, nom, type, taille). Au clic, MailDesk demande à Resend une URL de téléchargement directe/temporaire puis le client desktop ou mobile ouvre/télécharge lui-même le fichier. Si une Edge Function fournit déjà une URL directe, les clients savent l'utiliser sans repasser par un proxy.

La route `/api/mobile/profile` expose uniquement l'identité d'envoi par défaut et, si configurée, `MAILDESK_MOBILE_SIGNATURE_HTML`. Les images data/base64 incluses dans cette signature sont converties en CID par la route d'envoi existante.

## Licence

MailDesk est distribué sous licence **GNU General Public License v3.0 (GPL-3.0-only)**.

Vous pouvez utiliser, étudier, modifier et redistribuer le logiciel. Si vous redistribuez MailDesk ou une version dérivée, le code source correspondant doit rester disponible sous GPL-3.0 et les mêmes libertés doivent être conservées.

Copyright © 2026 **DevLow**.

Le texte complet est disponible dans le fichier [LICENSE](LICENSE).

## Remarque sur la suppression

Resend reste le transport et l'historique distant. Une suppression définitive dans MailDesk marque le message comme supprimé dans la base locale et dans la synchronisation MailDesk ; elle ne prétend pas supprimer un historique distant lorsque le fournisseur ne propose pas l'opération correspondante.

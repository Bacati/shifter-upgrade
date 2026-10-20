# ecu-licensing

Stock d'ECU + génération des clés d'activation. Dépôt **séparé** du firmware (`shifter`) :
le secret HMAC et la base de stock ne doivent jamais se retrouver dans le dépôt du firmware.

Python 3.9+, stdlib seulement (`pyserial` uniquement pour parler à la carte : `pip install pyserial`).
Tests : `python -m unittest discover -s tests -t .`

## Principe

```
cle = HEX_MAJ( HMAC-SHA256( SECRET, "<MAC>:<tier>" ) )[0..15]      (identique à src/persistence/License.cpp)
```
Une clé n'est valable que pour **une carte** (sa MAC) et **un niveau**. Elle n'est pas consommée (SAV : re-saisie possible).
La base ne contient **ni secret ni clé** (le journal garde une empreinte de 8 hex) ; une clé se recalcule toujours.

Cycle d'un ECU : `stock → reserved → programmed → shipped` (un ECU en stock est BASIC, sans clé).

## Secret

```bash
python -c "import secrets;print(secrets.token_hex(32))" > secret.txt     # à garder HORS dépôt + sauvegardé
export ECU_SECRET_FILE=secret.txt        # ou ECU_SECRET=...
```
Le **même** secret doit être dans `src/persistence/secrets.h` du firmware (`LICENSE_HMAC_SECRET`).
Refusé : absent, < 32 caractères, placeholder. Le changer invalide toutes les clés déjà émises.

## Atelier

```bash
python -m ecu_licensing register --port COM5          # carte neuve branchée (firmware factory) -> stock
python -m ecu_licensing add-file macs.txt             # ou un lot de MAC (une par ligne)
python -m ecu_licensing stock

python -m ecu_licensing reserve --order 1234 --tier TRACK     # ce que le site fera à la commande
python -m ecu_licensing pending                               # quelle carte (MAC) prendre
python -m ecu_licensing prepare --order 1234 --port COM5      # BRANCHER la bonne carte : MAC vérifiée,
                                                                  # clé envoyée, niveau contrôlé, statut mis à jour
#   puis flasher la prod SANS effacer la NVS :  pio run -e esp32dev -t upload
python -m ecu_licensing ship --order 1234
```
Sans liaison série : `python -m ecu_licensing key --order 1234` affiche la clé à coller dans la page web de l'ECU.

Après-vente : `upgrade --mac <HWID> --tier PRO` (refuse une MAC inconnue, une baisse ou un niveau identique),
`reissue --mac <HWID>` (même clé, carte réinitialisée), `cancel --order N` (commande non programmée), `log`.

## Pour le futur site e-commerce

Appeler `ecu_licensing.service.Service` (`reserve`, `issue_key`, `upgrade_key`) derrière une API **authentifiée** ;
le secret reste côté serveur. `reserve` est atomique (`BEGIN IMMEDIATE`) et idempotent par numéro de commande.
La page de mise à niveau doit passer par `upgrade_key` : elle refuse toute MAC absente de la base.

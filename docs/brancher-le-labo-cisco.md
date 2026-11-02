# Superviser le labo Cisco du projet 3

Packet Tracer est un simulateur fermé : ses équipements ne sont pas joignables depuis l'extérieur. Pour superviser de vrais IOS, on reconstruit la topologie du [projet 3](https://github.com/ebarrault/Lab-Cisco-PME) dans **GNS3** (images IOSv / IOSvL2) et on relie GNS3 à la machine qui exécute la supervision.

## 1. Relier GNS3 à la supervision

Dans GNS3, ajouter un nœud **Cloud** relié à l'interface de la machine hôte (ou à un adaptateur *loopback* sous Windows), puis le connecter à un port libre de `SW-CORE-SIEGE` placé dans le VLAN 99 (management). Donner à la machine hôte une adresse du VLAN 99, par exemple `10.10.99.200/24`, avec une route vers `10.0.0.0/8` via `10.10.99.1`.

## 2. Activer SNMP en lecture seule sur chaque équipement

```
configure terminal
ip access-list standard ACL-SNMP
 permit host 10.10.99.200
 deny any log
snmp-server community SupervisionRO RO ACL-SNMP
snmp-server location Siege - Bayonne
snmp-server contact noc@pme.local
snmp-server ifindex persist
end
write memory
```

> SNMP v2c transmet la communauté en clair : elle est limitée à la machine de supervision par une ACL. En production, préférer SNMPv3 (`snmp-server group … v3 priv`), dont le support est une évolution prévue.

## 3. Déclarer les équipements

Dans l'interface (*Équipements → Ajouter*) ou par l'API :

| Nom | Adresse | Type | SNMP |
|---|---|---|---|
| R-SIEGE | 10.10.255.1 | ROUTER | oui, communauté `SupervisionRO` |
| SW-CORE-SIEGE | 10.10.99.1 | SWITCH | oui |
| SW-ACC1-SIEGE | 10.10.99.11 | SWITCH | oui |
| SW-ACC2-SIEGE | 10.10.99.12 | SWITCH | oui |
| R-AGENCE | 10.20.99.1 | ROUTER | oui (via le tunnel VPN) |
| SW-AGENCE | 10.20.99.11 | SWITCH | oui |
| SRV-WEB | 10.10.30.30 | SERVER | non (ping seul) |

```bash
curl -X POST localhost:3002/api/devices -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"R-SIEGE","host":"10.10.255.1","type":"ROUTER","site":"Siège","snmpEnabled":true,"snmpCommunity":"SupervisionRO"}'
```

## 4. Ce qu'on observe

- `shutdown` sur `Tunnel0` de R-SIEGE → R-AGENCE et SW-AGENCE passent **hors ligne** après deux cycles : la supervision voit la coupure du VPN.
- `shutdown` sur une interface active d'un commutateur → alerte **Interface tombée**. Une interface déjà désactivée par l'administrateur ne déclenche rien (on compare `ifAdminStatus` et `ifOperStatus`).
- `reload` d'un équipement → alerte **Redémarrage détecté** (baisse de `sysUpTime`).

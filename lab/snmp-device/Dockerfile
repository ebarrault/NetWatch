# Équipement simulé : agent SNMP v2c (Net-SNMP) qui répond au ping et expose
# sysName, sysUpTime et la table des interfaces du conteneur.
FROM alpine:3.20
RUN apk add --no-cache net-snmp net-snmp-tools
COPY snmpd.conf /etc/snmp/snmpd.conf
EXPOSE 161/udp
CMD ["snmpd", "-f", "-Lo", "-C", "-c", "/etc/snmp/snmpd.conf", "udp:161"]

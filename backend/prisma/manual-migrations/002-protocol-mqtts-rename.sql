-- D-0135 (user-directed, 2026-09-21): the protocol catalog is reduced to HTTPS + MQTT, and the second one is named "MQTT"
-- (was "MQTTS"). MQTT ingestion and the connectivity health check look the protocol up BY NAME, so any database that was
-- bootstrapped earlier and still holds "MQTTS" must be renamed or MQTT ingestion would stop resolving a protocol id.
--
-- Idempotent: after the first run no "MQTTS" row exists, so re-running (every bootstrap re-applies every manual migration)
-- changes nothing; it also refuses to rename if an "MQTT" row already exists (no duplicate names). The row keeps its id, so
-- ingestion tokens / products that reference it keep working.
--
-- The four retired protocols (LoRaWAN, BACnet, Modbus, OPC UA) are deliberately NOT deleted here: the bootstrap re-applies this
-- file on every deploy, and a recurring DELETE by name would also remove a protocol somebody later adds on purpose through the
-- protocols API. Existing databases drop them once, by hand — see deploy/DEPLOY.md ("Retired protocols").
UPDATE protocols
SET name = 'MQTT'
WHERE name = 'MQTTS'
  AND NOT EXISTS (SELECT 1 FROM protocols WHERE name = 'MQTT');

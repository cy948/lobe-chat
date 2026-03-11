import { loadSettings } from '../settings';
import { log } from './logger';

export async function bindCurrentDeviceToTopic(client: any, topicId: string): Promise<string> {
  const settings = loadSettings();
  const currentDeviceId = settings?.currentDeviceId;

  if (!currentDeviceId) {
    log.error("No current device is saved. Run 'lh connect' first.");
    process.exit(1);
    return '';
  }

  const deviceState = await client.aiAgent.listOnlineDevices.query();
  if (!deviceState.gatewayConfigured) {
    log.error('Remote device gateway is not configured for the current server.');
    process.exit(1);
    return '';
  }

  const isOnline = deviceState.devices?.some((device: any) => device.deviceId === currentDeviceId);
  if (!isOnline) {
    log.error(
      `Current device "${currentDeviceId}" is offline or unavailable. Reconnect it with 'lh connect' before continuing.`,
    );
    process.exit(1);
    return '';
  }

  const updatedTopic = await client.topic.updateTopicMetadata.mutate({
    id: topicId,
    metadata: { boundDeviceId: currentDeviceId },
  });

  if (!Array.isArray(updatedTopic) || updatedTopic.length === 0) {
    log.error(`Topic "${topicId}" was not found or could not be updated.`);
    process.exit(1);
    return '';
  }

  return currentDeviceId;
}

export async function unbindDeviceFromTopic(client: any, topicId: string): Promise<void> {
  const updatedTopic = await client.topic.updateTopicMetadata.mutate({
    id: topicId,
    metadata: { boundDeviceId: null },
  });

  if (!Array.isArray(updatedTopic) || updatedTopic.length === 0) {
    log.error(`Topic "${topicId}" was not found or could not be updated.`);
    process.exit(1);
  }
}

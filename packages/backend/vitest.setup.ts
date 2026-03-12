import { rmSync } from 'node:fs';

process.env.EVENT_RADAR_DISABLE_PERSISTENCE = 'true';

rmSync('/tmp/event-radar-seen', { recursive: true, force: true });

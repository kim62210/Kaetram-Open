import Formulas from '../info/formulas';
import Item from '../game/entity/objects/item';
import Character from '../game/entity/character/character';
import Items from '../../data/items.json';

import log from '@kaetram/common/util/log';
import Utils from '@kaetram/common/util/utils';
import Filter from '@kaetram/common/util/filter';
import { Modules, Opcodes } from '@kaetram/common/network';
import {
    CommandPacket,
    DespawnPacket,
    NPCPacket,
    SpawnPacket,
    StorePacket
} from '@kaetram/common/network/impl';

import type Region from '../game/map/region';
import type Entity from '../game/entity/entity';
import type Mob from '../game/entity/character/mob/mob';
import type Player from '../game/entity/character/player/player';
import type Quest from '../game/entity/character/player/quest/quest';
import type Skill from '../game/entity/character/player/skill/skill';
import type Achievement from '../game/entity/character/player/achievement/achievement';

export default class Commands {
    private world;
    private entities;

    public constructor(private player: Player) {
        let { world } = player;

        this.world = world;
        this.entities = world.entities;
    }

    public parse(rawText: string): void {
        let blocks = rawText.slice(1).split(' ');

        if (blocks.length === 0) return;

        let command = blocks.shift()!;

        this.handlePlayerCommands(command, blocks);
        this.handleModeratorCommands(command, blocks);
        this.handleAdminCommands(command, blocks);
    }

    /**
     * Commands that are accessible to all the players.
     * @param command The command that was entered.
     * @param blocks Associated string blocks after the command.
     */

    private async handlePlayerCommands(command: string, blocks: string[]): Promise<void> {
        switch (command) {
            case 'players': {
                let players = this.world.entities.getPlayerUsernames(),
                    population = players.length,
                    singular = population === 1;

                this.player.notify(
                    `현재 ${population}명이 접속 중입니다.`
                );

                // Show the names of the players that are online.
                if (this.player.isAdmin()) this.player.notify(players.join(', '));

                return;
            }

            case 'coords': {
                return this.player.notify(`x: ${this.player.x} y: ${this.player.y}`);
            }

            case 'g':
            case 'gc':
            case 'global': {
                return this.player.chat(
                    Filter.clean(blocks.join(' ')),
                    true,
                    false,
                    'rgba(191, 161, 63, 1.0)'
                );
            }

            case 'pm':
            case 'msg': {
                let asterikBlocks = blocks.join(' ').split('*'),
                    [, username] = asterikBlocks;

                if (!username) return;

                let message = blocks.slice(username.split(' ').length).join(' ');

                this.player.sendPrivateMessage(username.toLowerCase(), message);

                break;
            }

            case 'ping': {
                this.player.ping();
                break;
            }

            case 'guild': {
                let subCommand = blocks.shift()!;

                if (!this.player.guild) return this.player.notify('길드에 속해 있지 않습니다.');

                switch (subCommand) {
                    case 'kick': {
                        let username = blocks.join(' ');

                        if (!username)
                            return this.player.notify(
                                '잘못된 명령어입니다. 사용법: /guild kick [아이디]'
                            );

                        this.world.guilds.kick(this.player, username);

                        this.player.notify(`${username}님을 길드에서 추방했습니다.`);

                        break;
                    }

                    case 'rank': {
                        let rank = blocks.shift()!,
                            username = blocks.join(' ');

                        if (!rank || !username)
                            return this.player.notify(
                                '잘못된 명령어입니다. 사용법: /guild rank [등급 0-6] [아이디]'
                            );

                        // Prevent the player from setting the rank to landlord.
                        if (parseInt(rank) === 7 || rank === 'landlord')
                            return this.player.notify('등급을 landlord로 설정할 수 없습니다.');

                        let guild = await this.world.guilds.getGuild(this.player.guild);

                        if (!guild) return this.player.notify('길드에 속해 있지 않습니다.');

                        let member = await this.world.guilds.getMember(guild, username);

                        if (!member)
                            return this.player.notify(
                                `${username}님의 길드원 정보를 찾을 수 없습니다.`
                            );

                        this.world.guilds.setRank(guild, this.player, member, parseInt(rank));

                        this.player.notify(`${username}님의 등급을 ${rank}(으)로 설정했습니다.`);

                        break;
                    }
                }

                break;
            }
        }
    }

    /**
     * Commands only accessible to moderators and administrators.
     * @param command The command that was entered.
     * @param blocks The associated string blocks after the command.
     */

    private handleModeratorCommands(command: string, blocks: string[]): void {
        if (!this.player.isMod() && !this.player.isAdmin() && !this.player.isHollowAdmin()) return;

        switch (command) {
            case 'mute':
            case 'ban': {
                let duration = parseInt(blocks.shift()!),
                    targetName = blocks.join(' ').toLowerCase();

                if (!duration || !targetName)
                    return this.player.notify(
                        '잘못된 명령어입니다. 사용법: /ban(mute) [시간] [아이디]'
                    );

                // Prevent banning yourself.
                if (targetName === this.player.username)
                    return this.player.notify(`자기 자신을 차단할 수는 없습니다.`);

                let user: Player = this.world.getPlayerByName(targetName);

                if (!user)
                    return this.player.notify(`${targetName}님을 찾을 수 없습니다.`);

                // Moderators can only mute/ban people within certain limits.
                if (this.player.isMod()) {
                    if (command === 'mute' && duration > 168) duration = 168;
                    if (command === 'ban' && duration > 72) duration = 72;
                }

                let hours = duration;

                // Convert hours to milliseconds.
                duration *= 60 * 60 * 1000;

                let timeFrame = Date.now() + duration;

                if (command === 'mute') {
                    user.mute = timeFrame;
                    user.save();

                    this.player.notify(`${user.username}님을 ${hours}시간 동안 채팅 금지했습니다.`);
                } else if (command === 'ban') {
                    user.ban = timeFrame;

                    user.connection.sendUTF8('ban');
                    user.connection.close('banned');

                    this.player.notify(`${user.username}님을 ${hours}시간 동안 차단했습니다.`);
                }

                return;
            }

            case 'unmute': {
                let uTargetName = blocks.join(' '),
                    uUser = this.world.getPlayerByName(uTargetName);

                if (!uTargetName) return this.player.notify(`${uTargetName}님을 찾을 수 없습니다.`);

                uUser.mute = Date.now() - 3600;

                uUser.save();

                this.player.notify(`${uUser.username}님의 채팅 금지를 해제했습니다.`);

                return;
            }

            case 'kick':
            case 'forcekick': {
                let username = blocks.join(' ');

                if (!username)
                    return this.player.notify(`잘못된 명령어입니다. 사용법: /kick [아이디]`);

                let player = this.world.getPlayerByName(username);

                if (!player)
                    return this.player.notify(`${username}님을 찾을 수 없습니다.`);

                player.connection.close(
                    `${this.player.username} kicked ${username}`,
                    command === 'forcekick'
                );

                break;
            }

            case 'jail': {
                let duration = parseInt(blocks.shift()!),
                    username = blocks.join(' ');

                if (!duration || !username)
                    return this.player.notify(
                        '잘못된 명령어입니다. 사용법: /jail [시간] [아이디]'
                    );

                let player = this.world.getPlayerByName(username);

                if (!player)
                    return this.player.notify(`${username}님을 찾을 수 없습니다.`);

                // Limit the duration of the jail sentence for mods.
                if (this.player.isMod() && duration > 12) duration = 12;

                let hours = duration;

                // Convert hours to milliseconds.
                duration *= 60 * 60 * 1000;

                player.jail = Date.now() + duration;
                player.sendToSpawn();

                player.notify(`${hours}시간 동안 감옥에 수감되었습니다.`, 'crimsonred');
                this.player.notify(`${player.username}님을 ${hours}시간 동안 감옥에 수감했습니다.`);

                break;
            }

            case 'unjail': {
                let username = blocks.join(' ');

                if (!username)
                    return this.player.notify(`잘못된 명령어입니다. 사용법: /unjail [아이디]`);

                let player = this.world.getPlayerByName(username);

                if (!player)
                    return this.player.notify(`${username}님을 찾을 수 없습니다.`);

                player.jail = 0;
                player.sendToSpawn();

                player.notify(`감옥에서 풀려났습니다.`);
                this.player.notify(`${player.username}님을 감옥에서 풀어줬습니다.`);
            }
        }
    }

    /**
     * The commands only accessible to administrators.
     * @param command The command that was entered.
     * @param blocks The associated string blocks after the command.
     */

    private handleAdminCommands(command: string, blocks: string[]): void {
        if (!this.player.isAdmin()) return;

        let username: string,
            player: Player,
            x: number,
            y: number,
            instance: string,
            target: string,
            key: string,
            entity: Character,
            targetEntity: Character,
            questKey: string,
            quest: Quest,
            achievementKey: string,
            achievement: Achievement,
            region: Region,
            item: Item;

        switch (command) {
            case 'spawn': {
                let key = blocks.shift(),
                    count = parseInt(blocks.shift()!);

                if (!key) return;

                if (!count) count = 1;

                item = new Item(key, -1, -1, true, 1);

                if (!item.exists) return this.player.notify(`키 ${key}에 해당하는 아이템이 없습니다.`);

                item.count = count;

                this.player.inventory.add(item);

                return;
            }

            case 'take': {
                let index = parseInt(blocks.shift()!),
                    container = blocks.shift()!,
                    username = blocks.join(' ');

                if (!index || !username)
                    return this.player.notify(
                        '잘못된 명령어입니다. 사용법: /take [인덱스] [container=bank/inventory] [아이디]'
                    );

                let player = this.world.getPlayerByName(username);

                if (!player) return this.player.notify(`${username}님을 찾을 수 없습니다.`);

                let containerType = container === 'inventory' ? player.inventory : player.bank,
                    slot = containerType.get(index);

                if (!slot.key)
                    return this.player.notify(`${username}님의 ${index}번 슬롯에 아이템이 없습니다.`);

                containerType.remove(index, slot.count);

                this.player.notify(`${username}님으로부터 ${slot.key} ${slot.count}개를 가져왔습니다.`);

                return;
            }

            case 'takeitem': {
                let key = blocks.shift(),
                    count = parseInt(blocks.shift()!),
                    container = blocks.shift()!,
                    username = blocks.join(' ');

                if (!key || !username || (container !== 'inventory' && container !== 'bank'))
                    return this.player.notify(
                        '잘못된 명령어입니다. 사용법: /takeitem [키] [개수] [container=bank/inventory] [아이디]'
                    );

                let player = this.world.getPlayerByName(username);

                if (!player) return this.player.notify(`${username}님을 찾을 수 없습니다.`);

                let containerType = container === 'inventory' ? player.inventory : player.bank;

                containerType.removeItem(key, count);

                this.player.notify(`${username}님으로부터 ${key} ${count}개를 가져왔습니다.`);

                return;
            }

            case 'copybank':
            case 'copyinventory': {
                let username = blocks.join(' ');

                if (!username)
                    return this.player.notify('잘못된 명령어입니다. 사용법: /copybank [아이디]');

                let player = this.world.getPlayerByName(username);

                if (!player) return this.player.notify(`${username}님이 접속해 있지 않습니다.`);

                if (command === 'copybank') {
                    this.player.bank.empty();

                    player.bank.forEachSlot((slot) =>
                        this.player.bank.add(this.player.bank.getItem(slot))
                    );
                } else {
                    this.player.inventory.empty();

                    player.inventory.forEachSlot((slot) =>
                        this.player.inventory.add(this.player.inventory.getItem(slot))
                    );
                }

                this.player.notify(`${username}님의 ${command}을(를) 복사했습니다.`);

                break;
            }

            case 'drop': {
                let key = blocks.shift(),
                    count = parseInt(blocks.shift()!);

                if (!key) return;

                if (!count) count = 1;

                this.world.entities.spawnItem(key, this.player.x, this.player.y, true, count);

                break;
            }

            case 'remove': {
                let key = blocks.shift(),
                    count = parseInt(blocks.shift()!);

                if (!key || !count) return;

                this.player.inventory.removeItem(key, count);

                return;
            }

            case 'empty': {
                return this.player.inventory.empty();
            }

            case 'teleport': {
                let x = parseInt(blocks.shift()!),
                    y = parseInt(blocks.shift()!),
                    withAnimation = parseInt(blocks.shift()!);

                if (x && y) this.player.teleport(x, y, !!withAnimation, false, true);

                return;
            }

            case 'teletome': {
                username = blocks.join(' ');
                player = this.world.getPlayerByName(username);

                player?.teleport(this.player.x, this.player.y, false, false, true);

                return;
            }

            case 'teleto': {
                username = blocks.join(' ');
                player = this.world.getPlayerByName(username);

                if (player) this.player.teleport(player.x, player.y, false, false, true);

                return;
            }

            case 'immortal':
            case 'nohit':
            case 'invincible': {
                if (this.player.status.has(Modules.Effects.Invincible)) {
                    this.player.status.remove(Modules.Effects.Invincible);

                    this.player.notify('무적 상태가 해제되었습니다.');
                } else {
                    this.player.status.add(Modules.Effects.Invincible);

                    this.player.notify('무적 상태가 되었습니다.');
                }
                return;
            }

            case 'mob': {
                target = blocks.shift()!;

                if (!target) return this.player.notify('몹이 지정되지 않았습니다.');

                this.entities.spawnMob(target, this.player.x, this.player.y);

                return;
            }

            case 'allattack': {
                region = this.world.map.regions.get(this.player.region);
                target = blocks.shift()!;

                if (!target)
                    return this.player.notify(
                        `잘못된 명령어입니다. 사용법: /allattack [대상_instance]`
                    );

                if (!region) return this.player.notify('지역을 찾을 수 없습니다.');

                targetEntity = this.entities.get(target) as Character;

                if (!targetEntity) return;

                region.forEachEntity((entity: Entity) => {
                    if (!entity.isMob() || entity.instance === target) return;

                    entity.combat.attack(targetEntity);
                });

                break;
            }

            case 'pointer': {
                if (blocks.length > 1) {
                    let posX = parseInt(blocks.shift()!),
                        posY = parseInt(blocks.shift()!);

                    if (!posX || !posY) return;

                    this.player.pointer({
                        type: Opcodes.Pointer.Location,
                        instance: this.player.instance,
                        x: posX,
                        y: posY
                    });
                } else {
                    let instance = blocks.shift()!;

                    if (!instance) return;

                    this.player.pointer(
                        {
                            type: Opcodes.Pointer.Entity,
                            instance
                        },
                        false
                    );
                }

                return;
            }

            case 'teleall': {
                this.entities.forEachPlayer((player: Player) => {
                    player.teleport(this.player.x, this.player.y, false, false, true);
                });

                return;
            }

            case 'getregion': {
                this.player.notify(`현재 지역: ${this.player.region}`);
                return;
            }

            case 'debug': {
                this.player.send(new CommandPacket({ command: 'debug' }));

                return;
            }

            case 'addexp':
            case 'addexperience': {
                key = blocks.shift()!;
                x = parseInt(blocks.shift()!);

                if (!key || !x) return;

                key = key.charAt(0).toUpperCase() + key.slice(1);

                this.player.skills
                    .get(Modules.Skills[key as keyof typeof Modules.Skills])
                    ?.addExperience(x);

                return;
            }

            case 'setlevel': {
                key = blocks.shift()!;
                x = parseInt(blocks.shift()!);
                username = blocks.join(' ');

                if (!username || !key || !x)
                    return this.player.notify(
                        '잘못된 명령어입니다. 사용법: /setlevel [스킬] [레벨] [아이디]'
                    );

                player = this.world.getPlayerByName(username);

                if (!player) return this.player.notify(`${username}님이 접속해 있지 않습니다.`);

                key = key.charAt(0).toUpperCase() + key.slice(1);

                let skill = player.skills.get(Modules.Skills[key as keyof typeof Modules.Skills]);

                if (!skill) return this.player.notify('잘못된 스킬입니다.');

                if (x < skill.level) {
                    skill.setExperience(0);
                    skill.addExperience(0);
                } else skill.addExperience(Formulas.levelsToExperience(skill.level, x));

                return;
            }

            case 'resetskills': {
                // Skills aren't meant to go backwards so you gotta sync and stuff lmao.
                this.player.skills.forEachSkill((skill: Skill) => {
                    skill.setExperience(0);
                    skill.addExperience(0);
                });
                this.player.skills.sync();
                break;
            }

            case 'max': {
                this.player.skills.forEachSkill((skill: Skill) => {
                    skill.setExperience(0);
                    skill.addExperience(696_420_969);
                });
                break;
            }

            case 'attackrange': {
                log.info(this.player.attackRange);
                return;
            }

            case 'resetregions': {
                log.info('Resetting regions...');

                this.player.regionsLoaded = [];
                this.player.updateRegion();

                return;
            }

            case 'clear': {
                this.player.inventory.forEachSlot((slot) => {
                    this.player.inventory.remove(slot.index, slot.count);
                });

                break;
            }

            case 'timeout': {
                this.player.connection.reject('timeout');

                break;
            }

            case 'togglepvp': {
                this.entities.forEachPlayer((player: Player) => {
                    player.updatePVP(true);
                });

                break;
            }

            case 'ms': {
                let movementSpeed = parseInt(blocks.shift()!);

                if (!movementSpeed) {
                    this.player.notify('이동 속도가 지정되지 않았습니다.');
                    return;
                }

                if (isNaN(movementSpeed)) {
                    this.player.notify('잘못된 이동 속도입니다.');
                    return;
                }

                if (movementSpeed > 10_000) movementSpeed = 2000;

                if (movementSpeed < 75)
                    // Just to not break stuff.
                    movementSpeed = 75;

                this.player.overrideMovementSpeed = movementSpeed;

                break;
            }

            case 'popup': {
                this.player.popup(
                    '새로운 퀘스트 발견!',
                    '@blue@새로운 @darkblue@퀘스트가 @green@발견@red@되었습니다!'
                );

                break;
            }

            case 'undostage': {
                key = blocks.shift()!;

                if (!key) return this.player.notify('퀘스트가 지정되지 않았습니다.');

                let quest = this.player.quests.get(key);

                if (!quest) return this.player.notify('퀘스트를 찾을 수 없습니다.');

                quest.setStage(quest.getStage() - 1);

                break;
            }

            case 'resetquests': {
                this.player.quests.forEachQuest((quest: Quest) => {
                    quest.setStage(0, undefined, true, true);
                });
                break;
            }

            case 'resetquest': {
                key = blocks.shift()!;

                if (!key) return this.player.notify('퀘스트가 지정되지 않았습니다.');

                let quest = this.player.quests.get(key);

                quest.setStage(0, undefined, true, true);
                break;
            }

            case 'resetachievements': {
                this.player.achievements.forEachAchievement((achievement) =>
                    achievement.setStage(0)
                );

                this.player.updateRegion();

                break;
            }

            case 'movenpc': {
                instance = blocks.shift()!;
                x = parseInt(blocks.shift()!);
                y = parseInt(blocks.shift()!);

                if (!instance)
                    return this.player.notify(`잘못된 명령어입니다. 사용법: /movenpc instance x y`);

                entity = this.entities.get(instance) as Character;

                if (!entity) return this.player.notify(`엔티티를 찾을 수 없습니다.`);

                if (entity.isMob()) entity.setPosition(x, y);

                break;
            }

            case 'nvn': {
                // NPC vs NPC (specify two instances)
                instance = blocks.shift()!;
                target = blocks.shift()!;

                if (!instance || !target)
                    return this.player.notify(`잘못된 명령어입니다. 사용법: /nvn instance target`);

                entity = this.entities.get(instance) as Character;
                targetEntity = this.entities.get(target) as Character;

                if (!entity || !targetEntity)
                    return this.player.notify(`지정된 엔티티 instance를 찾을 수 없습니다.`);

                entity.combat.attack(targetEntity);

                this.player.notify(`${entity.name}이(가) ${targetEntity.name}을(를) 공격합니다.`);

                break;
            }

            case 'kill': {
                username = blocks.join(' ');

                if (!username)
                    return this.player.notify(
                        `잘못된 명령어입니다. 사용법: /kill username/instance`
                    );

                player = this.world.getPlayerByName(username);

                if (player) player.hit(player.hitPoints.getHitPoints());

                targetEntity = this.entities.get(username) as Character;

                if (targetEntity) targetEntity.hit(targetEntity.hitPoints.getHitPoints());

                break;
            }

            case 'finishquest': {
                questKey = blocks.shift()!;

                if (!questKey)
                    return this.player.notify(`잘못된 명령어입니다. 사용법: /finishquest questKey`);

                quest = this.player.quests.get(questKey);

                if (quest) quest.setStage(9999);
                else this.player.notify(`키 ${questKey}에 해당하는 퀘스트를 찾을 수 없습니다.`);

                break;
            }

            case 'finishachievement': {
                achievementKey = blocks.shift()!;

                if (!achievementKey)
                    return this.player.notify(
                        `잘못된 명령어입니다. 사용법: /finishachievement achievementKey`
                    );

                achievement = this.player.achievements.get(achievementKey);

                if (achievement) achievement.finish();
                else this.player.notify(`키 ${achievementKey}에 해당하는 업적을 찾을 수 없습니다.`);

                break;
            }

            case 'finishachievements': {
                return this.player.achievements.forEachAchievement((achievement) =>
                    achievement.finish()
                );
            }

            case 'poison': {
                instance = blocks.shift()!;

                if (instance) {
                    log.debug('Poisoning entity...');

                    entity = this.entities.get(instance) as Character;

                    if (!entity)
                        return this.player.notify(
                            `instance ${instance}에 해당하는 엔티티를 찾을 수 없습니다.`
                        );

                    if (!entity.isMob() && !entity.isPlayer())
                        this.player.notify('해당 엔티티는 중독시킬 수 없습니다.');

                    if (entity.poison) {
                        entity.setPoison();
                        this.player.notify('엔티티의 중독을 해제했습니다.');
                    } else {
                        entity.setPoison(0);
                        this.player.notify('엔티티를 중독시켰습니다.');
                    }
                } else {
                    log.debug('Poisoning player.');

                    if (this.player.poison) {
                        this.player.setPoison();
                        this.player.notify('중독이 해제되었습니다!');
                    } else {
                        this.player.setPoison(0); // 0 === Modules.PoisonType.Venom
                        this.player.notify('중독되었습니다!');
                    }
                }

                break;
            }

            case 'poisonarea': {
                region = this.world.map.regions.get(this.player.region);

                if (!region) this.player.notify('지역을 불러오는 데 문제가 발생했습니다.');

                this.player.notify(`해당 지역의 모든 엔티티가 중독됩니다.`);

                region.forEachEntity((entity: Entity) => {
                    if (!entity.isMob() && !entity.isPlayer()) return;

                    (entity as Character).setPoison(0);
                });

                break;
            }

            case 'roam': {
                region = this.world.map.regions.get(this.player.region);

                if (!region) this.player.notify('지역을 불러오는 데 문제가 발생했습니다.');

                this.player.notify(`해당 지역의 모든 몹이 배회를 시작합니다!`);

                region.forEachEntity((entity: Entity) => {
                    if (!entity.isMob()) return;

                    entity.roamingCallback?.();
                });

                break;
            }

            case 'talk': {
                instance = blocks.shift()!;

                if (!instance)
                    return this.player.notify(`잘못된 명령어입니다. 사용법: /talk instance`);

                targetEntity = this.entities.get(instance) as Character;

                if (!targetEntity)
                    return this.player.notify(`instance ${instance}에 해당하는 엔티티를 찾을 수 없습니다.`);

                (targetEntity as Mob).talkCallback?.('테스트 대화 메시지입니다.');

                break;
            }

            case 'distance': {
                x = parseInt(blocks.shift()!);
                y = parseInt(blocks.shift()!);

                if (!x || !y)
                    return this.player.notify(`잘못된 명령어입니다. 사용법: /distance x y`);

                this.player.notify(
                    `거리: ${Utils.getDistance(this.player.x, this.player.y, x, y)}`
                );

                break;
            }

            case 'nuke': {
                let all = !!blocks.shift();

                region = this.world.map.regions.get(this.player.region);

                region.forEachEntity((entity: Entity) => {
                    if (!(entity instanceof Character)) return;
                    if (entity.instance === this.player.instance) return;

                    if (!all && entity.isPlayer()) return;

                    entity.deathCallback?.(this.player);
                });

                this.player.notify(
                    '모두를 처치했습니다.'
                );

                break;
            }

            case 'noclip': {
                this.player.noclip = !this.player.noclip;

                this.player.notify(`Noclip: ${this.player.noclip}`);
                break;
            }

            case 'addability': {
                key = blocks.shift()!;

                if (!key) return this.player.notify(`잘못된 명령어입니다. 사용법: /addability key`);

                this.player.abilities.add(key, 1);
                break;
            }

            case 'setability': {
                key = blocks.shift()!;
                x = parseInt(blocks.shift()!);

                if (!key || !x)
                    return this.player.notify(`잘못된 명령어입니다. 사용법: /setability key level`);

                this.player.abilities.setLevel(key, x);

                break;
            }

            case 'setquickslot': {
                key = blocks.shift()!;
                x = parseInt(blocks.shift()!);

                if (!key || isNaN(x))
                    return this.player.notify(
                        `잘못된 명령어입니다. 사용법: /setquickslot key quickslot`
                    );

                this.player.abilities.setQuickSlot(key, x);
                break;
            }

            case 'resetabilities': {
                return this.player.abilities.reset();
            }

            case 'store': {
                key = blocks.shift()!;

                if (!key) return this.player.notify(`잘못된 명령어입니다. 사용법: /store key`);

                this.player.send(
                    new StorePacket(Opcodes.Store.Open, this.world.stores.serialize(key))
                );

                this.player.storeOpen = key;

                break;
            }

            case 'aoe': {
                this.player.hit(600, this.player, 2);
                break;
            }

            case 'bank': {
                this.player.canAccessContainer = true;

                this.player.send(new NPCPacket(Opcodes.NPC.Bank, this.player.bank.serialize()));
                break;
            }

            case 'openbank': {
                let username = blocks.shift()!;

                if (!username)
                    return this.player.notify(`잘못된 명령어입니다. 사용법: /openbank [아이디]`);

                let player = this.world.getPlayerByName(username);

                if (!player) return this.player.notify(`${username}님을 찾을 수 없습니다.`);

                this.player.send(new NPCPacket(Opcodes.NPC.Bank, player.bank.serialize()));

                break;
            }

            case 'setrank': {
                if (this.player.isHollowAdmin()) return;

                let rankText = blocks.shift()!;

                username = blocks.join(' ');

                if (!username || !rankText)
                    return this.player.notify(`잘못된 명령어입니다. 사용법: /setrank [아이디] [등급]`);

                player = this.world.getPlayerByName(username);

                if (!player)
                    return this.world.database.setRank(
                        username,
                        Modules.Ranks[rankText as keyof typeof Modules.Ranks]
                    );

                let rank = Modules.Ranks[rankText as keyof typeof Modules.Ranks];

                if (isNaN(rank)) return this.player.notify(`잘못된 등급입니다: ${rankText}`);

                player.setRank(rank);
                player.sync();

                break;
            }

            case 'setpet': {
                let key = blocks.shift()!;

                if (!key) return this.player.notify(`잘못된 명령어입니다. 사용법: /setpet key`);

                this.player.setPet(key);

                break;
            }

            case 'opencrafting': {
                return this.world.crafting.open(this.player, Modules.Skills.Crafting);
            }

            case 'openalchemy': {
                return this.world.crafting.open(this.player, Modules.Skills.Alchemy);
            }

            case 'opencooking': {
                return this.world.crafting.open(this.player, Modules.Skills.Cooking);
            }

            case 'opensmithing': {
                return this.world.crafting.open(this.player, Modules.Skills.Smithing);
            }

            case 'opensmelting': {
                return this.world.crafting.open(this.player, Modules.Skills.Smelting);
            }

            case 'lootbag': {
                let items: Item[] = [
                    new Item('oldonesblade', -1, -1, false, 1),
                    new Item('froghelm', -1, -1, false, 1),
                    new Item('gold', -1, -1, false, 1500)
                ];

                this.world.entities.spawnLootBag(
                    this.player.x,
                    this.player.y,
                    this.player.username,
                    items
                );
                break;
            }

            case 'ipban': {
                let username = blocks.join(' ').toLowerCase();

                if (!username)
                    return log.info(`Malformed command, expected /${command} <username>`);

                let player = this.world.getPlayerByName(username);

                if (!player) return log.info(`Could not find player by name: ${username}.`);

                this.player.database.setIpBan(player.connection.address, command === 'ipban');

                this.player.notify(`${player.username}님을 IP 차단했습니다.`);

                // Kick all players with the same IP.
                for (let p of this.entities.getPlayersByIp(player.connection.address))
                    p.connection.reject('banned');

                break;
            }

            case 'countdown': {
                let time = parseInt(blocks.shift()!);

                if (!time) return this.player.notify(`잘못된 명령어입니다. 사용법: /countdown time`);

                this.player.countdown(time);

                break;
            }

            case 'find': {
                let npc = this.world.entities.getNPCByKey(blocks.join(' '));

                this.player.notify(
                    npc
                        ? `NPC 발견: ${npc.name} (x: ${npc.x}, y: ${npc.y})`
                        : `NPC를 찾을 수 없습니다.`
                );

                break;
            }

            case 'testitems': {
                this.player.bank.empty();

                // Add 100 of each item into the bank.
                for (let key in Items) this.player.bank.add(new Item(key, -1, -1, false, 100));

                break;
            }

            case 'collision': {
                let x = parseInt(blocks.shift()!) || this.player.x,
                    y = parseInt(blocks.shift()!) || this.player.y;

                if (!x || !y)
                    return this.player.notify(`잘못된 명령어입니다. 사용법: /collision x y`);

                let index = this.world.map.coordToIndex(x, y);

                this.player.notify(`${this.world.map.isColliding(x, y)} - index: ${index}`);

                log.debug(`Data: ${this.world.map.data[index]}`);

                break;
            }

            case 'hide': {
                this.player.visible = !this.player.visible;

                if (this.player.visible) {
                    this.player.notify(`이제 보이는 상태입니다.`);

                    this.player.sendToRegions(new SpawnPacket(this.player), true);
                } else {
                    this.player.notify(`이제 보이지 않는 상태입니다.`);

                    this.player.sendToRegions(
                        new DespawnPacket({ instance: this.player.instance }),
                        true
                    );
                }

                break;
            }

            case 'tp': {
                let key = blocks.shift()!;

                switch (key) {
                    case 'home': {
                        return this.player.teleport(191, 166, true, false, true);
                    }

                    case 'underwater': {
                        return this.player.teleport(119, 290, true, false, true);
                    }

                    case 'underwatervolcano': {
                        return this.player.teleport(194, 427, true, false, true);
                    }

                    case 'kok': {
                        return this.player.teleport(290, 357, true, false, true);
                    }

                    case 'mountain': {
                        return this.player.teleport(440, 312, true, false, true);
                    }

                    case 'santa': {
                        return this.player.teleport(526, 256, true, false, true);
                    }

                    case 'ice': {
                        return this.player.teleport(608, 332, true, false, true);
                    }

                    case 'pink': {
                        return this.player.teleport(685, 433, true, false, true);
                    }

                    case 'hell': {
                        return this.player.teleport(1112, 787, true, false, true);
                    }

                    case 'sewer': {
                        return this.player.teleport(1117, 709, true, false, true);
                    }

                    case 'shroom': {
                        return this.player.teleport(992, 631, true, false, true);
                    }

                    case 'skeletonking': {
                        return this.player.teleport(120, 794, true, false, true);
                    }

                    case 'ogrelord': {
                        return this.player.teleport(342, 166, true, false, true);
                    }

                    case 'queenant': {
                        return this.player.teleport(591, 820, true, false, true);
                    }

                    case 'forestdragon': {
                        return this.player.teleport(457, 807, true, false, true);
                    }

                    case 'crystalcave': {
                        return this.player.teleport(886, 622, true, false, true);
                    }

                    case 'piratecaptain': {
                        return this.player.teleport(930, 752, true, false, true);
                    }
                }

                break;
            }

            case 'toggle': {
                let key = blocks.shift()!,
                    effect: Modules.Effects = Modules.Effects.None;

                switch (key) {
                    case 'cold':
                    case 'freeze':
                    case 'freezing': {
                        if (this.player.status.has(Modules.Effects.Freezing))
                            return this.player.status.remove(Modules.Effects.Freezing);

                        effect = Modules.Effects.Freezing;
                        break;
                    }

                    case 'fire':
                    case 'burn':
                    case 'burning': {
                        if (this.player.status.has(Modules.Effects.Burning))
                            return this.player.status.remove(Modules.Effects.Burning);

                        effect = Modules.Effects.Burning;
                        break;
                    }

                    case 'terror': {
                        if (this.player.status.has(Modules.Effects.TerrorStatus))
                            return this.player.status.remove(Modules.Effects.TerrorStatus);

                        effect = Modules.Effects.TerrorStatus;
                        break;
                    }

                    case 'stun': {
                        if (this.player.status.has(Modules.Effects.Stun))
                            return this.player.status.remove(Modules.Effects.Stun);

                        effect = Modules.Effects.Stun;
                        break;
                    }

                    case 'hide': {
                        return this.player.send(new CommandPacket({ command: 'hide' }));
                    }

                    default: {
                        return this.player.status.clear();
                    }
                }

                return this.player.status.addWithTimeout(effect, 60_000);
            }
        }
    }
}

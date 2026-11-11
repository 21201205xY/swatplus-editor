<script setup lang="ts">
	import { reactive, computed } from 'vue';
	import { useI18n } from 'vue-i18n';
	import { useHelpers } from '@/helpers';

	const { constants, formatters, currentProject, utilities } = useHelpers();

	const { t } = useI18n({ useScope: 'global' });
	const electron = window.electronApi;

	interface Props {
		text?: string | null,
		ranSwat?: boolean,
		noIcon?: boolean,
		variant?: "text" | "elevated" | "flat" | "tonal" | "outlined" | "plain" | undefined,
		color?: string | undefined,
		block?: boolean,
		rounded?: string | number | boolean | undefined,
		size?: string | number | undefined,
		class?: string | undefined,
		asListItem?: boolean
	}

	const props = withDefaults(defineProps<Props>(), {
		text: undefined,
		ranSwat: false,
		noIcon: false,
		variant: undefined,
		color: undefined,
		block: false,
		rounded: undefined,
		size: undefined,
		class: undefined,
		asListItem: false
	});

	const buttonText = computed(() => props.text === undefined ? t('components.iahris.name') : props.text);

	let unavailable = reactive({
		show: false,
		norun: false,
		notinstalled: false,
		error: ''
	});

	const unavailableTitle = computed(() => {
		if (unavailable.norun) return t('components.iahris.notReady');
		if (unavailable.notinstalled) return t('components.iahris.notInstalled');
		return t('components.iahris.openError');
	})

	function open() {
		unavailable.norun = false;
		unavailable.notinstalled = false;
		unavailable.show = false;
		let path = electron.getIahrisPath();

		if (!props.ranSwat) {
			unavailable.norun = true;
			unavailable.show = true;
		} else if (!utilities.pathExists(path)) {
			unavailable.notinstalled = true;
			unavailable.show = true;
		} else {
			unavailable.error = electron.launchIahris(currentProject.scenariosPath||'');
			if (!formatters.isNullOrEmpty(unavailable.error)) {
				unavailable.show = true;
			}
		}
	}
</script>

<template>
	<v-list-item v-if="constants.globals.platform === 'win32' && asListItem" @click="open">
		<v-list-item-title>{{ buttonText }}</v-list-item-title>
	</v-list-item>
	<v-btn v-else-if="constants.globals.platform === 'win32' && !noIcon" @click="open" :active="false">
		<v-icon>fas fa-folder-plus</v-icon> {{ buttonText }}
	</v-btn>
	<v-btn v-else-if="constants.globals.platform === 'win32' && noIcon" @click="open" :variant="variant" :color="color" :block="block" :rounded="rounded" :size="size" :class="props.class">
		{{ buttonText }}
	</v-btn>

	<v-dialog v-model="unavailable.show" width="auto">
		<v-card :title="unavailableTitle">
			<v-card-text>
				<p v-if="unavailable.norun" class="py-5">
					{{ t('components.iahris.runFirst') }}
				</p>
				<p v-else-if="unavailable.notinstalled" class="py-5">
					{{ t('components.iahris.description') }}
				</p>
			</v-card-text>
			<v-divider></v-divider>
			<v-card-actions>
				<v-btn v-if="unavailable.norun" color="primary" variant="text" to="/run">{{ t('components.iahris.configureRun') }}</v-btn>
				<open-in-browser v-else-if="unavailable.notinstalled" url="https://swat.tamu.edu/software/plus/" :text="t('components.iahris.install')" button color="primary" />
				<v-btn @click="unavailable.show = false">{{ t('common.cancel') }}</v-btn>
			</v-card-actions>
		</v-card>
	</v-dialog>
</template>
<script setup lang="ts">
	import { useFormatters } from '@/helpers/formatters';
	import { useI18n } from 'vue-i18n';
	const { t } = useI18n({ useScope: 'global' });
	const formatters = useFormatters();

	interface Props {
		errorTitle?: string | null,
		stackTrace: string | null
	}

	const props = withDefaults(defineProps<Props>(), {
		errorTitle: undefined,
		stackTrace: null
	});
</script>

<template>
	<div>
		<error-alert :text="props.errorTitle === undefined ? t('components.stackTrace.title') : props.errorTitle"></error-alert>

		<p>
			<i18n-t scope="global" keypath="components.stackTrace.instructions" tag="span">
				<template #userGroup><open-in-browser url="https://groups.google.com/d/forum/swatplus-editor" :text="t('components.stackTrace.userGroup')" /></template>
			</i18n-t>
		</p>

		<v-textarea v-model="props.stackTrace" rows="3" max-rows="6" readonly class="mb-4" @focus="$event.target.select()"></v-textarea>
	</div>
</template>

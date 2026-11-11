<script setup lang="ts">
	import { ref } from 'vue';
	import { useI18n } from 'vue-i18n';
	const { t } = useI18n({ useScope: 'global' });

	const electron = window.electronApi;
	const props = defineProps({
		value: {
			type: String,
			required: false,
			default: ''
		},
		label: {
			type: String,
			required: false,
			default: ''
		},
		required: {
			type: Boolean,
			required: false
		},
		invalidFeedback: {
			type: String,
			required: false,
			default: undefined
		},
		id: {
			type: String
		},
		fileType: {
			type: String,
			required: true
		},
		saveDialog: {
			type: Boolean,
			default: false
		},
		defaultFileName: {
			type: String,
			required: false
		},
		hint: {
			type: String,
			required: false,
			default: undefined
		},
		persistentHint: {
			type: Boolean,
			required: false
		}
	})

	let model = ref(props.value);
	let rules = {
		required: (value:string) => !!value || (props.invalidFeedback ?? t('common.required'))
	}

	let appliedRules = props.required ? [rules.required] : [];

	const emit = defineEmits([
		'update:modelValue',
		'change',
		'blur',
		'focus',
		'keyup',
	])

	function updateModelValue($event:any) {
		model.value = $event.target.value;
    	emit('update:modelValue', $event.target.value);
	}

	function selectFile() {
		let filters:any;

		if (props.fileType == "json") {
			filters = [{ name: 'Json', extensions: ['json'] }];
		} else if (props.fileType == "sqlite") {
			filters = [{ name: 'SQLite', extensions: ['sqlite','db'] },{ name: t('components.fileInput.allFiles'), extensions: ['*'] }]
		} else if (props.fileType == "exe") {
			filters = [{ name: t('components.fileInput.executable'), extensions: ['exe'] }];
		} else if (props.fileType == "csv") {
			filters = [{ name: t('components.fileInput.csv'), extensions: ['csv'] }];
		} else if (props.fileType == "cli") {
			filters = [{ name: t('components.fileInput.cli'), extensions: ['txt','cli'] },{ name: t('components.fileInput.allFiles'), extensions: ['*'] }]
		} else if (props.fileType == "text") {
			filters = [{ name: t('components.fileInput.text'), extensions: ['txt','csv'] },{ name: t('components.fileInput.allFiles'), extensions: ['*'] }]
		} else {
			filters = [{ name: t('components.fileInput.allFiles'), extensions: ['*'] }]
		}

		let files:any;
		if (props.saveDialog) {
			files = electron.saveFileDialog({filters: filters, defaultPath: props.defaultFileName});
		} else {
			files = electron.openFileDialog({filters: filters});
		}
		console.log(files);

		if (files !== undefined) {
			model.value = props.saveDialog ? files : files[0];
			emit('update:modelValue', model.value);
		}
	}
</script>

<template>
	<v-text-field :value="model" :label="props.label" :id="props.id" :rules="appliedRules" 
		:hint="props.hint ?? t('components.fileInput.browseHint')" :persistent-hint="props.persistentHint"
		@click:append="selectFile" append-icon="fas fa-folder-open"
		@input="updateModelValue"
		@change="$emit('change', $event.target.value)"
		@focus="$emit('focus', $event.target.value)"
		@blur="$emit('blur', $event.target.value)"
		@keyup="$emit('keyup', $event.target.value)"></v-text-field>
</template>
import { watch } from 'vue';
import { createI18n } from 'vue-i18n';
import en from './locales/en.json';
import zhCN from './locales/zh-CN.json';

const savedLocale = window.electronApi.getStoreSetting('uiLanguage');

const i18n = createI18n({
	legacy: false,
	locale: savedLocale === 'zh-CN' ? 'zh-CN' : 'en',
	fallbackLocale: 'en',
	messages: {
		en,
		'zh-CN': zhCN
	}
});

watch(i18n.global.locale, (locale) => {
	document.documentElement.lang = locale;
	window.electronApi.addToStore('uiLanguage', locale);
}, { immediate: true });

export default i18n;

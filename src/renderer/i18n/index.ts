import { watch } from 'vue';
import { createI18n } from 'vue-i18n';
import enCommon from './locales/en/common.json';
import enNavigation from './locales/en/navigation.json';
import enSetup from './locales/en/setup.json';
import enComponents from './locales/en/components.json';
import zhCommon from './locales/zh-CN/common.json';
import zhNavigation from './locales/zh-CN/navigation.json';
import zhSetup from './locales/zh-CN/setup.json';
import zhComponents from './locales/zh-CN/components.json';

const savedLocale = window.electronApi.getStoreSetting('uiLanguage');

const i18n = createI18n({
	legacy: false,
	locale: savedLocale === 'zh-CN' ? 'zh-CN' : 'en',
	fallbackLocale: 'en',
	messages: {
		en: { common: enCommon, navigation: enNavigation, setup: enSetup, components: enComponents },
		'zh-CN': { common: zhCommon, navigation: zhNavigation, setup: zhSetup, components: zhComponents }
	}
});

watch(i18n.global.locale, (locale) => {
	document.documentElement.lang = locale;
	window.electronApi.addToStore('uiLanguage', locale);
}, { immediate: true });

export default i18n;

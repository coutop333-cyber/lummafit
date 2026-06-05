import { useCallback } from 'react';

declare global {
  interface Window {
    fbq?: (...args: any[]) => void;
  }
}

export const useMetaPixel = () => {
  const trackEvent = useCallback((eventName: string, data: Record<string, any> = {}, extra?: Record<string, any>) => {
    if (typeof window !== 'undefined' && window.fbq) {
      window.fbq('track', eventName, data, extra);
    }
  }, []);

  const trackPageView = useCallback(() => trackEvent('PageView'), [trackEvent]);

  const trackViewContent = useCallback((d: any) => trackEvent('ViewContent', {
    content_name: d.content_name,
    content_type: d.content_type || 'product',
    content_ids: d.content_ids,
    value: d.value,
    currency: d.currency || 'BRL',
  }, d.event_id ? { eventID: d.event_id } : undefined), [trackEvent]);

  const trackAddToCart = useCallback((d: any) => trackEvent('AddToCart', {
    content_name: d.content_name,
    content_type: d.content_type || 'product',
    content_ids: d.content_ids,
    value: d.value,
    currency: d.currency || 'BRL',
    num_items: d.num_items || 1,
  }, d.event_id ? { eventID: d.event_id } : undefined), [trackEvent]);

  const trackInitiateCheckout = useCallback((d: any) => trackEvent('InitiateCheckout', {
    content_name: d.content_name,
    content_ids: d.content_ids,
    value: d.value,
    currency: d.currency || 'BRL',
    num_items: d.num_items || 1,
  }, d.event_id ? { eventID: d.event_id } : undefined), [trackEvent]);

  const trackAddPaymentInfo = useCallback((d: any) => trackEvent('AddPaymentInfo', {
    content_name: d.content_name,
    content_ids: d.content_ids,
    value: d.value,
    currency: d.currency || 'BRL',
    num_items: d.num_items || 1,
    payment_type: 'Pix',
  }, d.event_id ? { eventID: d.event_id } : undefined), [trackEvent]);

  const trackLead = useCallback((d: any) => trackEvent('Lead', {
    content_name: d.content_name,
    content_category: d.content_category,
    value: d.value || 0,
    currency: d.currency || 'BRL',
  }), [trackEvent]);

  const trackPurchase = useCallback((d: any) => {
    if (typeof window !== 'undefined' && window.fbq) {
      window.fbq('track', 'Purchase', {
        content_name: d.content_name,
        content_ids: d.content_ids,
        value: d.value,
        currency: d.currency || 'BRL',
        num_items: d.num_items || 1,
      }, d.event_id ? { eventID: d.event_id } : undefined);
    }
  }, []);

  return {
    trackPageView,
    trackViewContent,
    trackAddToCart,
    trackInitiateCheckout,
    trackAddPaymentInfo,
    trackLead,
    trackPurchase,
  };
};

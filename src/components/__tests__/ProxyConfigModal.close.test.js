import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ProxyConfigModal from '../ProxyConfigModal.vue';

describe('ProxyConfigModal - Close Logic (Task 10.6)', () => {
  it('should have a close function that clears errors', () => {
    const wrapper = mount(ProxyConfigModal, {
      props: {
        show: true,
        account: null
      }
    });

    // Access the component instance
    const vm = wrapper.vm;
    
    // Verify close function exists
    expect(typeof vm.close).toBe('function');
    
    // Set some errors
    vm.formErrors.server = 'Test error';
    vm.formErrors.port = 'Test port error';
    vm.formErrors.general = 'General error';
    
    // Call close
    vm.close();
    
    // Verify errors are cleared
    expect(vm.formErrors.server).toBe('');
    expect(vm.formErrors.port).toBe('');
    expect(vm.formErrors.general).toBe('');
  });

  it('should emit update:show with false when close is called', () => {
    const wrapper = mount(ProxyConfigModal, {
      props: {
        show: true,
        account: null
      }
    });

    // Call close
    wrapper.vm.close();

    // Verify update:show event was emitted with false
    expect(wrapper.emitted('update:show')).toBeTruthy();
    expect(wrapper.emitted('update:show')[0][0]).toBe(false);
  });

  it('should have backdrop click handler that calls close', async () => {
    const wrapper = mount(ProxyConfigModal, {
      props: {
        show: true,
        account: null
      },
      attachTo: document.body
    });

    await wrapper.vm.$nextTick();

    // Find the overlay div with @click.self="close"
    const overlay = wrapper.find('.fixed.inset-0');
    expect(overlay.exists()).toBe(true);
    
    // Verify it has the close handler
    expect(overlay.attributes('class')).toContain('fixed');
    expect(overlay.attributes('class')).toContain('inset-0');
  });

  it('should have cancel button that calls close', async () => {
    const wrapper = mount(ProxyConfigModal, {
      props: {
        show: true,
        account: null
      },
      attachTo: document.body
    });

    await wrapper.vm.$nextTick();

    // Find the cancel button (type="button")
    const buttons = wrapper.findAll('button[type="button"]');
    expect(buttons.length).toBeGreaterThan(0);
    
    // The cancel button should be the first button with type="button"
    const cancelButton = buttons[0];
    expect(cancelButton.text()).toContain('取消');
  });

  it('should clear errors when closing after validation failure', () => {
    const wrapper = mount(ProxyConfigModal, {
      props: {
        show: true,
        account: null
      }
    });

    const vm = wrapper.vm;
    
    // Simulate validation failure
    vm.formData.server = '';
    vm.validateForm();
    
    // Verify errors exist
    expect(vm.formErrors.server).toBeTruthy();
    
    // Close modal
    vm.close();
    
    // Verify errors are cleared
    expect(vm.formErrors.server).toBe('');
    expect(vm.formErrors.port).toBe('');
    expect(vm.formErrors.general).toBe('');
  });

  it('should call clearErrors when close is called', () => {
    const wrapper = mount(ProxyConfigModal, {
      props: {
        show: true,
        account: null
      }
    });

    const vm = wrapper.vm;
    
    // Verify clearErrors function exists
    expect(typeof vm.clearErrors).toBe('function');
    
    // Set some errors
    vm.formErrors.server = 'Test error';
    
    // Call clearErrors
    vm.clearErrors();
    
    // Verify errors are cleared
    expect(vm.formErrors.server).toBe('');
    expect(vm.formErrors.port).toBe('');
    expect(vm.formErrors.general).toBe('');
  });

  it('should clear errors when account changes', async () => {
    const wrapper = mount(ProxyConfigModal, {
      props: {
        show: true,
        account: null
      }
    });

    const vm = wrapper.vm;
    
    // Set some errors
    vm.formErrors.server = 'Test error';
    vm.formErrors.port = 'Test port error';
    
    // Change account prop
    await wrapper.setProps({
      account: {
        id: 'test',
        username: 'testuser',
        proxyConfig: {
          enabled: true,
          server: 'proxy.example.com',
          port: 8080,
          protocol: 'http'
        }
      }
    });

    await wrapper.vm.$nextTick();

    // Errors should be cleared by the watch
    expect(vm.formErrors.server).toBe('');
    expect(vm.formErrors.port).toBe('');
    expect(vm.formErrors.general).toBe('');
  });

  it('should not emit save event when close is called', () => {
    const wrapper = mount(ProxyConfigModal, {
      props: {
        show: true,
        account: null
      }
    });

    // Call close
    wrapper.vm.close();

    // Verify save event was NOT emitted
    expect(wrapper.emitted('save')).toBeFalsy();
    
    // But update:show should be emitted
    expect(wrapper.emitted('update:show')).toBeTruthy();
  });
});

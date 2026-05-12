import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import ProxyConfigModal from '../ProxyConfigModal.vue';

describe('ProxyConfigModal - Form Data Bindings', () => {
  it('should bind all form fields with v-model', async () => {
    const wrapper = mount(ProxyConfigModal, {
      props: {
        show: true,
        account: null
      },
      attachTo: document.body
    });
    
    await wrapper.vm.$nextTick();

    // Check that all form inputs exist
    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(true);
    expect(wrapper.find('input[type="text"]').exists()).toBe(true);
    expect(wrapper.find('input[type="number"]').exists()).toBe(true);
    expect(wrapper.find('select').exists()).toBe(true);
    expect(wrapper.find('input[type="password"]').exists()).toBe(true);
  });

  it('should initialize form with default values', () => {
    const wrapper = mount(ProxyConfigModal, {
      props: {
        show: true,
        account: null
      }
    });

    // Check default values
    const checkbox = wrapper.find('input[type="checkbox"]');
    const serverInput = wrapper.find('input[type="text"]');
    const portInput = wrapper.find('input[type="number"]');
    const protocolSelect = wrapper.find('select');

    expect(checkbox.element.checked).toBe(false);
    expect(serverInput.element.value).toBe('');
    expect(portInput.element.value).toBe('8080');
    expect(protocolSelect.element.value).toBe('http');
  });

  it('should load existing proxy config from account', async () => {
    const account = {
      id: 'test-account',
      username: 'testuser',
      proxyConfig: {
        enabled: true,
        server: 'proxy.example.com',
        port: 9090,
        protocol: 'https',
        username: 'proxyuser',
        password: 'proxypass'
      }
    };

    const wrapper = mount(ProxyConfigModal, {
      props: {
        show: true,
        account
      }
    });

    await wrapper.vm.$nextTick();

    // Check that form is populated with existing config
    const checkbox = wrapper.find('input[type="checkbox"]');
    const serverInput = wrapper.find('input[type="text"]');
    const portInput = wrapper.find('input[type="number"]');
    const protocolSelect = wrapper.find('select');
    const usernameInput = wrapper.findAll('input[type="text"]')[1];
    const passwordInput = wrapper.find('input[type="password"]');

    expect(checkbox.element.checked).toBe(true);
    expect(serverInput.element.value).toBe('proxy.example.com');
    expect(portInput.element.value).toBe('9090');
    expect(protocolSelect.element.value).toBe('https');
    expect(usernameInput.element.value).toBe('proxyuser');
    expect(passwordInput.element.value).toBe('proxypass');
  });

  it('should update formData when user changes inputs', async () => {
    const wrapper = mount(ProxyConfigModal, {
      props: {
        show: true,
        account: null
      }
    });

    // Change form values
    const checkbox = wrapper.find('input[type="checkbox"]');
    const serverInput = wrapper.find('input[type="text"]');
    const portInput = wrapper.find('input[type="number"]');
    const protocolSelect = wrapper.find('select');

    await checkbox.setValue(true);
    await serverInput.setValue('new-proxy.com');
    await portInput.setValue(7777);
    await protocolSelect.setValue('socks5');

    // Verify that internal formData is updated (by checking if save emits correct data)
    await wrapper.find('form').trigger('submit');

    expect(wrapper.emitted('save')).toBeTruthy();
    expect(wrapper.emitted('save')[0][0]).toMatchObject({
      enabled: true,
      server: 'new-proxy.com',
      port: 7777,
      protocol: 'socks5'
    });
  });

  it('should emit save event with form data on submit', async () => {
    const wrapper = mount(ProxyConfigModal, {
      props: {
        show: true,
        account: null
      }
    });

    // Fill form
    await wrapper.find('input[type="checkbox"]').setValue(true);
    await wrapper.find('input[type="text"]').setValue('test-proxy.com');
    await wrapper.find('input[type="number"]').setValue(8888);

    // Submit form
    await wrapper.find('form').trigger('submit');

    // Check that save event was emitted with correct data
    expect(wrapper.emitted('save')).toBeTruthy();
    expect(wrapper.emitted('save')[0][0]).toMatchObject({
      enabled: true,
      server: 'test-proxy.com',
      port: 8888,
      protocol: 'http'
    });
  });

  it('should reset form to defaults when account changes to null', async () => {
    const account = {
      id: 'test-account',
      username: 'testuser',
      proxyConfig: {
        enabled: true,
        server: 'proxy.example.com',
        port: 9090,
        protocol: 'https'
      }
    };

    const wrapper = mount(ProxyConfigModal, {
      props: {
        show: true,
        account
      }
    });

    await wrapper.vm.$nextTick();

    // Verify form is populated
    expect(wrapper.find('input[type="text"]').element.value).toBe('proxy.example.com');

    // Change account to null
    await wrapper.setProps({ account: null });
    await wrapper.vm.$nextTick();

    // Verify form is reset to defaults
    expect(wrapper.find('input[type="checkbox"]').element.checked).toBe(false);
    expect(wrapper.find('input[type="text"]').element.value).toBe('');
    expect(wrapper.find('input[type="number"]').element.value).toBe('8080');
    expect(wrapper.find('select').element.value).toBe('http');
  });

  it('should use number modifier for port input', async () => {
    const wrapper = mount(ProxyConfigModal, {
      props: {
        show: true,
        account: null
      }
    });

    const portInput = wrapper.find('input[type="number"]');
    await portInput.setValue('1234');

    // Submit and check that port is a number, not a string
    await wrapper.find('form').trigger('submit');

    expect(wrapper.emitted('save')[0][0].port).toBe(1234);
    expect(typeof wrapper.emitted('save')[0][0].port).toBe('number');
  });
});

describe('ProxyConfigModal - Save Logic', () => {
  it('should emit save event with validated form data on successful validation', async () => {
    const wrapper = mount(ProxyConfigModal, {
      props: {
        show: true,
        account: {
          id: 'test-account',
          username: 'testuser'
        }
      }
    });

    // Fill form with valid data
    await wrapper.find('input[type="checkbox"]').setValue(true);
    await wrapper.find('input[type="text"]').setValue('proxy.example.com');
    await wrapper.find('input[type="number"]').setValue(8080);
    await wrapper.find('select').setValue('http');

    // Submit form
    await wrapper.find('form').trigger('submit');

    // Should emit save event with validated data
    expect(wrapper.emitted('save')).toBeTruthy();
    expect(wrapper.emitted('save')[0][0]).toEqual({
      enabled: true,
      server: 'proxy.example.com',
      port: 8080,
      protocol: 'http',
      username: '',
      password: ''
    });
  });

  it('should emit update:show with false after successful save', async () => {
    const wrapper = mount(ProxyConfigModal, {
      props: {
        show: true,
        account: {
          id: 'test-account',
          username: 'testuser'
        }
      }
    });

    // Fill form with valid data
    await wrapper.find('input[type="text"]').setValue('proxy.example.com');
    await wrapper.find('input[type="number"]').setValue(8080);

    // Submit form
    await wrapper.find('form').trigger('submit');

    // Should close modal after save
    expect(wrapper.emitted('update:show')).toBeTruthy();
    expect(wrapper.emitted('update:show')[0][0]).toBe(false);
  });

  it('should not emit save event when validation fails', async () => {
    const wrapper = mount(ProxyConfigModal, {
      props: {
        show: true,
        account: {
          id: 'test-account',
          username: 'testuser'
        }
      }
    });

    // Submit with invalid data (empty server)
    await wrapper.find('input[type="text"]').setValue('');
    await wrapper.find('form').trigger('submit');

    // Should not emit save event
    expect(wrapper.emitted('save')).toBeFalsy();
    
    // Should not close modal
    expect(wrapper.emitted('update:show')).toBeFalsy();
  });

  it('should handle success scenario with all optional fields filled', async () => {
    const wrapper = mount(ProxyConfigModal, {
      props: {
        show: true,
        account: {
          id: 'test-account',
          username: 'testuser'
        }
      }
    });

    // Fill all fields including optional ones
    await wrapper.find('input[type="checkbox"]').setValue(true);
    await wrapper.find('input[type="text"]').setValue('proxy.example.com');
    await wrapper.find('input[type="number"]').setValue(9090);
    await wrapper.find('select').setValue('socks5');
    await wrapper.findAll('input[type="text"]')[1].setValue('proxyuser');
    await wrapper.find('input[type="password"]').setValue('proxypass');

    // Submit form
    await wrapper.find('form').trigger('submit');

    // Should emit save with all data
    expect(wrapper.emitted('save')).toBeTruthy();
    expect(wrapper.emitted('save')[0][0]).toEqual({
      enabled: true,
      server: 'proxy.example.com',
      port: 9090,
      protocol: 'socks5',
      username: 'proxyuser',
      password: 'proxypass'
    });
  });

  it('should handle error scenario with multiple validation failures', async () => {
    const wrapper = mount(ProxyConfigModal, {
      props: {
        show: true,
        account: {
          id: 'test-account',
          username: 'testuser'
        }
      }
    });

    // Submit with multiple invalid fields
    await wrapper.find('input[type="text"]').setValue('invalid!@#');
    await wrapper.find('input[type="number"]').setValue(99999);
    await wrapper.find('form').trigger('submit');

    // Should show multiple error messages
    expect(wrapper.text()).toContain('服务器地址格式不正确');
    expect(wrapper.text()).toContain('端口号必须在 1-65535 之间');
    expect(wrapper.text()).toContain('请修正表单中的错误后再保存');
    
    // Should not emit save event
    expect(wrapper.emitted('save')).toBeFalsy();
  });

  it('should persist form data through validation failures', async () => {
    const wrapper = mount(ProxyConfigModal, {
      props: {
        show: true,
        account: {
          id: 'test-account',
          username: 'testuser'
        }
      }
    });

    // Fill form with some valid and some invalid data
    await wrapper.find('input[type="checkbox"]').setValue(true);
    await wrapper.find('input[type="text"]').setValue(''); // Invalid
    await wrapper.find('input[type="number"]').setValue(8080);
    await wrapper.find('select').setValue('https');

    // Submit (will fail validation)
    await wrapper.find('form').trigger('submit');

    // Fix the invalid field
    await wrapper.find('input[type="text"]').setValue('proxy.example.com');

    // Submit again
    await wrapper.find('form').trigger('submit');

    // Should emit save with all the data (including previously valid fields)
    expect(wrapper.emitted('save')).toBeTruthy();
    expect(wrapper.emitted('save')[0][0]).toMatchObject({
      enabled: true,
      server: 'proxy.example.com',
      port: 8080,
      protocol: 'https'
    });
  });

  it('should emit save with disabled proxy config', async () => {
    const wrapper = mount(ProxyConfigModal, {
      props: {
        show: true,
        account: {
          id: 'test-account',
          username: 'testuser'
        }
      }
    });

    // Fill form but leave enabled unchecked
    await wrapper.find('input[type="checkbox"]').setValue(false);
    await wrapper.find('input[type="text"]').setValue('proxy.example.com');
    await wrapper.find('input[type="number"]').setValue(8080);

    // Submit form
    await wrapper.find('form').trigger('submit');

    // Should emit save with enabled: false
    expect(wrapper.emitted('save')).toBeTruthy();
    expect(wrapper.emitted('save')[0][0].enabled).toBe(false);
  });

  it('should clear errors after successful save', async () => {
    const wrapper = mount(ProxyConfigModal, {
      props: {
        show: true,
        account: {
          id: 'test-account',
          username: 'testuser'
        }
      }
    });

    // First submit with invalid data
    await wrapper.find('input[type="text"]').setValue('');
    await wrapper.find('form').trigger('submit');
    expect(wrapper.text()).toContain('服务器地址不能为空');

    // Fix and submit again
    await wrapper.find('input[type="text"]').setValue('proxy.example.com');
    await wrapper.find('form').trigger('submit');

    // Should emit save (errors cleared)
    expect(wrapper.emitted('save')).toBeTruthy();
  });

  it('should handle save with minimum required fields', async () => {
    const wrapper = mount(ProxyConfigModal, {
      props: {
        show: true,
        account: {
          id: 'test-account',
          username: 'testuser'
        }
      }
    });

    // Fill only required fields
    await wrapper.find('input[type="text"]').setValue('proxy.example.com');
    // Port has default value of 8080
    // Protocol has default value of 'http'

    // Submit form
    await wrapper.find('form').trigger('submit');

    // Should emit save with defaults for optional fields
    expect(wrapper.emitted('save')).toBeTruthy();
    expect(wrapper.emitted('save')[0][0]).toMatchObject({
      enabled: false, // Default
      server: 'proxy.example.com',
      port: 8080, // Default
      protocol: 'http', // Default
      username: '',
      password: ''
    });
  });
});

describe('ProxyConfigModal - Form Validation', () => {
  it('should show error when server address is empty', async () => {
    const wrapper = mount(ProxyConfigModal, {
      props: {
        show: true,
        account: null
      }
    });

    // Leave server empty and submit
    await wrapper.find('input[type="text"]').setValue('');
    await wrapper.find('form').trigger('submit');

    // Should show error message
    expect(wrapper.text()).toContain('服务器地址不能为空');
    
    // Should not emit save event
    expect(wrapper.emitted('save')).toBeFalsy();
  });

  it('should show error when server address format is invalid', async () => {
    const wrapper = mount(ProxyConfigModal, {
      props: {
        show: true,
        account: null
      }
    });

    // Enter invalid server address
    await wrapper.find('input[type="text"]').setValue('invalid server!@#');
    await wrapper.find('form').trigger('submit');

    // Should show error message
    expect(wrapper.text()).toContain('服务器地址格式不正确');
    
    // Should not emit save event
    expect(wrapper.emitted('save')).toBeFalsy();
  });

  it('should accept valid hostname formats', async () => {
    const validHostnames = [
      'proxy.example.com',
      'example.com',
      'localhost',
      '192.168.1.1',
      'my-proxy.test.org'
    ];

    for (const hostname of validHostnames) {
      const wrapper = mount(ProxyConfigModal, {
        props: {
          show: true,
          account: null
        }
      });

      await wrapper.find('input[type="text"]').setValue(hostname);
      await wrapper.find('form').trigger('submit');

      // Should not show server error
      expect(wrapper.text()).not.toContain('服务器地址格式不正确');
      
      // Should emit save event
      expect(wrapper.emitted('save')).toBeTruthy();
    }
  });

  it('should show error when port is out of range', async () => {
    const wrapper = mount(ProxyConfigModal, {
      props: {
        show: true,
        account: null
      }
    });

    // Set valid server
    await wrapper.find('input[type="text"]').setValue('proxy.example.com');
    
    // Set invalid port (too high)
    await wrapper.find('input[type="number"]').setValue(99999);
    await wrapper.find('form').trigger('submit');

    // Should show error message
    expect(wrapper.text()).toContain('端口号必须在 1-65535 之间');
    
    // Should not emit save event
    expect(wrapper.emitted('save')).toBeFalsy();
  });

  it('should show error when port is zero or negative', async () => {
    const wrapper = mount(ProxyConfigModal, {
      props: {
        show: true,
        account: null
      }
    });

    // Set valid server
    await wrapper.find('input[type="text"]').setValue('proxy.example.com');
    
    // Set invalid port (zero)
    await wrapper.find('input[type="number"]').setValue(0);
    await wrapper.find('form').trigger('submit');

    // Should show error message
    expect(wrapper.text()).toContain('端口号必须在 1-65535 之间');
    
    // Should not emit save event
    expect(wrapper.emitted('save')).toBeFalsy();
  });

  it('should accept valid port range (1-65535)', async () => {
    const validPorts = [1, 80, 443, 8080, 65535];

    for (const port of validPorts) {
      const wrapper = mount(ProxyConfigModal, {
        props: {
          show: true,
          account: null
        }
      });

      await wrapper.find('input[type="text"]').setValue('proxy.example.com');
      await wrapper.find('input[type="number"]').setValue(port);
      await wrapper.find('form').trigger('submit');

      // Should not show port error
      expect(wrapper.text()).not.toContain('端口号必须在 1-65535 之间');
      
      // Should emit save event
      expect(wrapper.emitted('save')).toBeTruthy();
    }
  });

  it('should show general error message when validation fails', async () => {
    const wrapper = mount(ProxyConfigModal, {
      props: {
        show: true,
        account: null
      }
    });

    // Submit with invalid data
    await wrapper.find('input[type="text"]').setValue('');
    await wrapper.find('form').trigger('submit');

    // Should show general error message
    expect(wrapper.text()).toContain('请修正表单中的错误后再保存');
  });

  it('should show visual feedback for invalid server input', async () => {
    const wrapper = mount(ProxyConfigModal, {
      props: {
        show: true,
        account: null
      }
    });

    // Submit with empty server
    await wrapper.find('input[type="text"]').setValue('');
    await wrapper.find('form').trigger('submit');

    // Server input should have error styling
    const serverInput = wrapper.find('input[type="text"]');
    expect(serverInput.classes()).toContain('border-red-500');
    expect(serverInput.classes()).toContain('bg-red-500/10');
  });

  it('should show visual feedback for invalid port input', async () => {
    const wrapper = mount(ProxyConfigModal, {
      props: {
        show: true,
        account: null
      }
    });

    // Set valid server but invalid port
    await wrapper.find('input[type="text"]').setValue('proxy.example.com');
    await wrapper.find('input[type="number"]').setValue(99999);
    await wrapper.find('form').trigger('submit');

    // Port input should have error styling
    const portInput = wrapper.find('input[type="number"]');
    expect(portInput.classes()).toContain('border-red-500');
    expect(portInput.classes()).toContain('bg-red-500/10');
  });

  it('should clear errors when form is valid and submitted', async () => {
    const wrapper = mount(ProxyConfigModal, {
      props: {
        show: true,
        account: null
      }
    });

    // First submit with invalid data
    await wrapper.find('input[type="text"]').setValue('');
    await wrapper.find('form').trigger('submit');
    expect(wrapper.text()).toContain('服务器地址不能为空');

    // Fix the data and submit again
    await wrapper.find('input[type="text"]').setValue('proxy.example.com');
    await wrapper.find('form').trigger('submit');

    // Errors should be cleared (modal closes, so we check save was emitted)
    expect(wrapper.emitted('save')).toBeTruthy();
  });

  it('should clear errors when modal is closed', async () => {
    const wrapper = mount(ProxyConfigModal, {
      props: {
        show: true,
        account: null
      }
    });

    // Submit with invalid data to show errors
    await wrapper.find('input[type="text"]').setValue('');
    await wrapper.find('form').trigger('submit');
    expect(wrapper.text()).toContain('服务器地址不能为空');

    // Close modal
    await wrapper.find('button[type="button"]').trigger('click');

    // Should emit update:show with false
    expect(wrapper.emitted('update:show')).toBeTruthy();
    expect(wrapper.emitted('update:show')[0][0]).toBe(false);
  });

  it('should handle backdrop click to close modal', async () => {
    const wrapper = mount(ProxyConfigModal, {
      props: {
        show: true,
        account: null
      },
      attachTo: document.body
    });

    // Submit with invalid data to show errors
    await wrapper.find('input[type="text"]').setValue('');
    await wrapper.find('form').trigger('submit');
    expect(wrapper.text()).toContain('服务器地址不能为空');

    // Click on backdrop (the overlay div with @click.self)
    const overlay = wrapper.find('.fixed.inset-0');
    await overlay.trigger('click');

    // Should emit update:show with false
    expect(wrapper.emitted('update:show')).toBeTruthy();
    expect(wrapper.emitted('update:show')[wrapper.emitted('update:show').length - 1][0]).toBe(false);
  });

  it('should handle cancel button click to close modal', async () => {
    const wrapper = mount(ProxyConfigModal, {
      props: {
        show: true,
        account: {
          id: 'test',
          username: 'testuser'
        }
      }
    });

    // Fill form with some data
    await wrapper.find('input[type="text"]').setValue('proxy.example.com');
    await wrapper.find('input[type="number"]').setValue(8080);

    // Click cancel button
    const cancelButton = wrapper.find('button[type="button"]');
    await cancelButton.trigger('click');

    // Should emit update:show with false
    expect(wrapper.emitted('update:show')).toBeTruthy();
    expect(wrapper.emitted('update:show')[0][0]).toBe(false);

    // Should NOT emit save event
    expect(wrapper.emitted('save')).toBeFalsy();
  });

  it('should clear form errors when closing via cancel button', async () => {
    const wrapper = mount(ProxyConfigModal, {
      props: {
        show: true,
        account: null
      }
    });

    // Submit with invalid data to show errors
    await wrapper.find('input[type="text"]').setValue('invalid!@#');
    await wrapper.find('form').trigger('submit');
    expect(wrapper.text()).toContain('服务器地址格式不正确');

    // Click cancel button
    await wrapper.find('button[type="button"]').trigger('click');

    // Should emit update:show
    expect(wrapper.emitted('update:show')).toBeTruthy();
    
    // Reopen modal to verify errors are cleared
    await wrapper.setProps({ show: false });
    await wrapper.vm.$nextTick();
    await wrapper.setProps({ show: true });
    await wrapper.vm.$nextTick();

    // Errors should not be visible anymore
    expect(wrapper.text()).not.toContain('服务器地址格式不正确');
  });

  it('should clear form errors when closing via backdrop click', async () => {
    const wrapper = mount(ProxyConfigModal, {
      props: {
        show: true,
        account: null
      },
      attachTo: document.body
    });

    // Submit with invalid data to show errors
    await wrapper.find('input[type="text"]').setValue('');
    await wrapper.find('input[type="number"]').setValue(99999);
    await wrapper.find('form').trigger('submit');
    expect(wrapper.text()).toContain('服务器地址不能为空');
    expect(wrapper.text()).toContain('端口号必须在 1-65535 之间');

    // Click backdrop
    const overlay = wrapper.find('.fixed.inset-0');
    await overlay.trigger('click');

    // Should emit update:show
    expect(wrapper.emitted('update:show')).toBeTruthy();
    
    // Reopen modal to verify errors are cleared
    await wrapper.setProps({ show: false });
    await wrapper.vm.$nextTick();
    await wrapper.setProps({ show: true });
    await wrapper.vm.$nextTick();

    // Errors should not be visible anymore
    expect(wrapper.text()).not.toContain('服务器地址不能为空');
    expect(wrapper.text()).not.toContain('端口号必须在 1-65535 之间');
  });

  it('should clear errors when account changes', async () => {
    const wrapper = mount(ProxyConfigModal, {
      props: {
        show: true,
        account: null
      }
    });

    // Submit with invalid data
    await wrapper.find('input[type="text"]').setValue('');
    await wrapper.find('form').trigger('submit');
    expect(wrapper.text()).toContain('服务器地址不能为空');

    // Change account
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

    // Errors should be cleared
    expect(wrapper.text()).not.toContain('服务器地址不能为空');
  });

  it('should handle server address with protocol prefix', async () => {
    const wrapper = mount(ProxyConfigModal, {
      props: {
        show: true,
        account: null
      }
    });

    // Enter server with http:// prefix
    await wrapper.find('input[type="text"]').setValue('http://proxy.example.com');
    await wrapper.find('form').trigger('submit');

    // Should accept it (validation strips protocol)
    expect(wrapper.emitted('save')).toBeTruthy();
  });

  it('should validate all fields together', async () => {
    const wrapper = mount(ProxyConfigModal, {
      props: {
        show: true,
        account: null
      }
    });

    // Submit with multiple invalid fields
    await wrapper.find('input[type="text"]').setValue('');
    await wrapper.find('input[type="number"]').setValue(0);
    await wrapper.find('form').trigger('submit');

    // Should show both errors
    expect(wrapper.text()).toContain('服务器地址不能为空');
    expect(wrapper.text()).toContain('端口号必须在 1-65535 之间');
    expect(wrapper.text()).toContain('请修正表单中的错误后再保存');
  });
});

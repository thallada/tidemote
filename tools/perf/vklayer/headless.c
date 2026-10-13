// A pass-through Vulkan layer whose manifest advertises VK_EXT_headless_surface, so headless
// Chrome can create its Vulkan instance on drivers (NVIDIA) that lack it. The loader implements
// headless surfaces itself and hands each driver only the extensions it supports.
#include <stdint.h>
#include <string.h>
#include <stddef.h>
#define VKAPI __attribute__((visibility("default")))
typedef int32_t VkResult;
typedef void *VkInstance, *VkPhysicalDevice, *VkDevice;
typedef void (*PFN_vkVoidFunction)(void);
typedef PFN_vkVoidFunction (*PFN_GIPA)(VkInstance, const char *);
typedef PFN_vkVoidFunction (*PFN_GDPA)(VkDevice, const char *);
typedef struct { int32_t sType; const void *pNext; } Base;
typedef struct ILink { struct ILink *pNext; PFN_GIPA nextGIPA; void *nextGPDPA; } ILink;
typedef struct { int32_t sType; const void *pNext; int32_t function; union { ILink *link; void *p[2]; } u; } ICreateInfo;
typedef struct DLink { struct DLink *pNext; PFN_GIPA nextGIPA; PFN_GDPA nextGDPA; } DLink;
typedef struct { int32_t sType; const void *pNext; int32_t function; union { DLink *link; void *p[2]; } u; } DCreateInfo;
typedef struct { int32_t sType; void *pNext; uint32_t version; PFN_GIPA gipa; PFN_GDPA gdpa; void *gpdpa; } Negotiate;
typedef VkResult (*PFN_CreateInstance)(const void *, const void *, VkInstance *);
typedef VkResult (*PFN_CreateDevice)(VkPhysicalDevice, const void *, const void *, VkDevice *);

static PFN_GIPA next_gipa;
static struct { VkDevice d; PFN_GDPA g; } devs[64];
static int ndev;

static VkResult create_instance(const void *ci, const void *alloc, VkInstance *out) {
  ICreateInfo *c = (ICreateInfo *)((const Base *)ci)->pNext;
  while (c && !(c->sType == 47 && c->function == 0)) c = (ICreateInfo *)c->pNext;
  if (!c) return -3;
  next_gipa = c->u.link->nextGIPA;
  c->u.link = c->u.link->pNext;
  return ((PFN_CreateInstance)next_gipa(NULL, "vkCreateInstance"))(ci, alloc, out);
}
static VkResult create_device(VkPhysicalDevice pd, const void *ci, const void *alloc, VkDevice *out) {
  DCreateInfo *c = (DCreateInfo *)((const Base *)ci)->pNext;
  while (c && !(c->sType == 48 && c->function == 0)) c = (DCreateInfo *)c->pNext;
  if (!c) return -3;
  PFN_GIPA gipa = c->u.link->nextGIPA; PFN_GDPA gdpa = c->u.link->nextGDPA;
  c->u.link = c->u.link->pNext;
  VkResult r = ((PFN_CreateDevice)gipa(NULL, "vkCreateDevice"))(pd, ci, alloc, out);
  if (r == 0 && ndev < 64) { devs[ndev].d = *out; devs[ndev].g = gdpa; ndev++; }
  return r;
}
VKAPI PFN_vkVoidFunction layer_GetDeviceProcAddr(VkDevice d, const char *n) {
  if (!strcmp(n, "vkGetDeviceProcAddr")) return (PFN_vkVoidFunction)layer_GetDeviceProcAddr;
  for (int i = ndev - 1; i >= 0; i--) if (devs[i].d == d) return devs[i].g(d, n);
  return NULL;
}
VKAPI PFN_vkVoidFunction layer_GetInstanceProcAddr(VkInstance inst, const char *n) {
  if (!strcmp(n, "vkGetInstanceProcAddr")) return (PFN_vkVoidFunction)layer_GetInstanceProcAddr;
  if (!strcmp(n, "vkCreateInstance")) return (PFN_vkVoidFunction)create_instance;
  if (!strcmp(n, "vkCreateDevice")) return (PFN_vkVoidFunction)create_device;
  if (!strcmp(n, "vkGetDeviceProcAddr")) return (PFN_vkVoidFunction)layer_GetDeviceProcAddr;
  return next_gipa ? next_gipa(inst, n) : NULL;
}
VKAPI VkResult vkNegotiateLoaderLayerInterfaceVersion(Negotiate *v) {
  if (v->version > 2) v->version = 2;
  v->gipa = layer_GetInstanceProcAddr; v->gdpa = layer_GetDeviceProcAddr; v->gpdpa = NULL;
  return 0;
}

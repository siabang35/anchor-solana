import{t as f,k as a,l as p,j as m}from"./index-DILgtjQx.js";import"./three-vendor-B-j3nisP.js";import"./react-vendor-CDAdxX5q.js";import"./data-vendor-CHuAUM7I.js";import"./ui-vendor-CaDzUQxD.js";import"./web3-vendor-BAQUMP27.js";const d=f`
  :host > wui-flex:first-child {
    height: 500px;
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-width: none;
  }

  :host > wui-flex:first-child::-webkit-scrollbar {
    display: none;
  }
`;var u=function(o,t,i,n){var r=arguments.length,e=r<3?t:n===null?n=Object.getOwnPropertyDescriptor(t,i):n,l;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")e=Reflect.decorate(o,t,i,n);else for(var s=o.length-1;s>=0;s--)(l=o[s])&&(e=(r<3?l(e):r>3?l(t,i,e):l(t,i))||e);return r>3&&e&&Object.defineProperty(t,i,e),e};let c=class extends a{render(){return p`
      <wui-flex flexDirection="column" .padding=${["0","3","3","3"]} gap="3">
        <w3m-activity-list page="activity"></w3m-activity-list>
      </wui-flex>
    `}};c.styles=d;c=u([m("w3m-transactions-view")],c);export{c as W3mTransactionsView};

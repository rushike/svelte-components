<script>
  import {onMount} from "svelte"
  import {TabulatorFull as Tabulator} from "tabulator-tables";
  let {data, columns = []} = $props();
  let tableComponent = $state();

  $effect(() => {
  const handleWheel = (e) => {
    // Your logic here
  };

  window.addEventListener('wheel', handleWheel, { passive: true });

  return () => {
    window.removeEventListener('wheel', handleWheel);
  };
});

  onMount(() => {
    console.log("will try to create tablulator : ", data);
    
    tableComponent = new Tabulator("#table", {
      index : "id"
      // data: data, //link data to table
      // reactiveData:true, //enable data reactivity
      // pagination : true,
      // columns: columns, //define table columns
      // columns:[ //Define Table Columns
      //   {title:"id", field:"id", width:150},
      //   {title:"code", field:"code", hozAlign:"left"},
      // ],
    });
    tableComponent.setData(data);
  });
</script>


<div id = "table"></div>

<svelte:head>
  <link href="https://unpkg.com/tabulator-tables@4.9.1/dist/css/tabulator.min.css" rel="stylesheet">
</svelte:head>
const DEFAULT_MAX_CELLS=4_000_000;
const MAX_SEQUENCE_LENGTH=2_000;

function fail(code){const error=new Error(code);error.code=code;throw error;}

export function alignSemanticSequences(left,right,options={}){
  if(!Array.isArray(left)||!Array.isArray(right)||left.length>MAX_SEQUENCE_LENGTH||right.length>MAX_SEQUENCE_LENGTH||left.some(value=>typeof value!=='string'||!value)||right.some(value=>typeof value!=='string'||!value))fail('COMPILER_ALIGNMENT_INPUT_INVALID');
  if(left.length===right.length&&left.every((value,index)=>value===right[index])){
    return {score:left.length*3,ambiguous:false,columns:left.map((value,index)=>({left:index,right:index,leftValue:value,rightValue:value,kind:'MATCH'}))};
  }
  const maxCells=Number.isInteger(options.maxCells)&&options.maxCells>0?options.maxCells:DEFAULT_MAX_CELLS;
  const rows=left.length+1,cols=right.length+1;
  if(rows*cols>maxCells)fail('COMPILER_ALIGNMENT_BUDGET_EXCEEDED');

  const score=Array.from({length:rows},()=>new Int32Array(cols));
  const count=Array.from({length:rows},()=>new Uint8Array(cols));
  const direction=Array.from({length:rows},()=>new Uint8Array(cols));
  count[0][0]=1;
  for(let i=1;i<rows;i++){score[i][0]=-2*i;count[i][0]=1;direction[i][0]=2;}
  for(let j=1;j<cols;j++){score[0][j]=-2*j;count[0][j]=1;direction[0][j]=4;}

  for(let i=1;i<rows;i++){
    for(let j=1;j<cols;j++){
      const diagonal=score[i-1][j-1]+(left[i-1]===right[j-1]?3:-3);
      const up=score[i-1][j]-2;
      const west=score[i][j-1]-2;
      const best=Math.max(diagonal,up,west);
      score[i][j]=best;
      let ways=0,mask=0;
      if(diagonal===best){ways+=count[i-1][j-1];mask|=1;}
      if(up===best){ways+=count[i-1][j];mask|=2;}
      if(west===best){ways+=count[i][j-1];mask|=4;}
      count[i][j]=Math.min(2,ways);
      direction[i][j]=mask;
    }
  }

  const columns=[];
  let i=left.length,j=right.length;
  while(i>0||j>0){
    const mask=direction[i][j];
    if(mask&1){
      const li=i-1,rj=j-1,match=left[li]===right[rj];
      columns.push({left:li,right:rj,leftValue:left[li],rightValue:right[rj],kind:match?'MATCH':'SUBSTITUTION'});
      i--;j--;
    }else if(mask&2){
      const li=i-1;columns.push({left:li,right:null,leftValue:left[li],rightValue:null,kind:'LEFT_ONLY'});i--;
    }else if(mask&4){
      const rj=j-1;columns.push({left:null,right:rj,leftValue:null,rightValue:right[rj],kind:'RIGHT_ONLY'});j--;
    }else fail('COMPILER_ALIGNMENT_INTERNAL_ERROR');
  }
  columns.reverse();
  return {score:score[left.length][right.length],ambiguous:count[left.length][right.length]>1,columns};
}
